import { database, ref, push, onValue, remove } from "./firebase-config.js";

let services = [];
let clients = [];
let employees = [];
let salonHoursConfig = null;
let salonBreakConfig = null;

const DAYS_MAP = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'friday': 4, 'thursday': 5, 'saturday': 6 };
let selectedTimeSlotMinutes = null;
let currentActiveReservationId = null;

// Écoute en temps réel de la configuration globale du salon
onValue(ref(database, 'salon_config'), (snapshot) => {
    const data = snapshot.val();

    salonHoursConfig = data?.hours || null;
    salonBreakConfig = data?.break || null;

    const daysHint = document.getElementById('salon-days-hint');

    if (daysHint) {
        daysHint.innerText =
            `Business hours: ${salonHoursConfig || "Not configured"} | Break & Closed days: ${salonBreakConfig || "Not configured"}`;
    }

    loadAvailableTimeSlots();
});

// Écoute en temps réel des services
onValue(ref(database, 'services'), (snapshot) => {
    const data = snapshot.val();
    services = [];
    if (data) {
        Object.keys(data).forEach(key => {
            services.push({ id: key, ...data[key] });
        });
    }
    initClientPage();
});

// Écoute en temps réel des clients
onValue(ref(database, 'clients'), (snapshot) => {
    const data = snapshot.val();
    clients = [];
    if (data) {
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }
    loadAvailableTimeSlots();
});


onValue(ref(database, 'employees'), (snapshot) => {
    const data = snapshot.val();
    employees = [];

    if (data) {
        Object.keys(data).forEach(key => {
            employees.push({
                id: key,
                ...data[key]
            });
        });
    }

    loadAvailableTimeSlots(); // ✅ OBLIGATOIRE
});

function hhmmToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + m;
}

function minutesToHHMM(totalMinutes) {
    let hours = Math.floor(totalMinutes / 60);
    let minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getSalonLimits() {
    const defaultOpen = 9 * 60;
    const defaultClose = 19 * 60;

    if (!salonHoursConfig) {
        return { open: defaultOpen, close: defaultClose };
    }

    const matches = salonHoursConfig.match(/\d{2}:\d{2}/g);

    if (!matches || matches.length < 2) {
        return { open: defaultOpen, close: defaultClose };
    }

    return {
        open: hhmmToMinutes(matches[0]),
        close: hhmmToMinutes(matches[1])
    };
}

function getPauseAndClosureLimits() {
    const defaultPauseStart = 12 * 60 + 30;
    const defaultPauseEnd = 13 * 60 + 30;
    
    if (!salonBreakConfig) {
        return {
            start: defaultPauseStart,
            end: defaultPauseEnd,
            closedDays: [0]
        };
    }
    
    const textLower = salonBreakConfig.toLowerCase();
    
    const matches = textLower.match(/\d{2}:\d{2}/g);
    
    let pauseStart = defaultPauseStart;
    let pauseEnd = defaultPauseEnd;
    
    if (matches && matches.length >= 2) {
        pauseStart = hhmmToMinutes(matches[0]);
        pauseEnd = hhmmToMinutes(matches[1]);
    }
    
    const closedDays = [];
    
    for (const [dayName, dayIndex] of Object.entries(DAYS_MAP)) {
        if (textLower.includes(dayName)) {
            closedDays.push(dayIndex);
        }
    }
    
    return {
        start: pauseStart,
        end: pauseEnd,
        closedDays: closedDays.length ? closedDays : [0]
    };
}

function cancelBookingById(id) {

    const confirmation = confirm(
        "Are you sure you want to cancel your appointment?"
    );

    if (!confirmation) return;

    // Correction du chemin Firebase, fermeture des parenthèses et suppression du doublon .then()
    remove(ref(database, `clients/${id}`))
        .then(() => {
            alert(
                ` 😊`
            );

            searchMyBookings();
        })
        .catch(error => {
            console.error("Détails de l'erreur :", error);
            alert("Erreur lors de l'annulation. Veuillez réessayer.");
        });
}





function initClientPage() {
    const select = document.getElementById('select-service');
    const dateInput = document.getElementById('appointment-date');
    const scheduleSection = document.getElementById('schedule-section');
    const bookingForm = document.getElementById('booking-form-section');
    
    if (!select) return;
    select.innerHTML = '';
    
    if (services.length === 0) {
        select.innerHTML = '<option value="">-- No services available --</option>';
        if (scheduleSection) scheduleSection.style.display = 'none';
        if (bookingForm) bookingForm.classList.add('hidden');
        return;
    }

    if (scheduleSection) scheduleSection.style.display = 'block';

    services.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });

    if (dateInput && !dateInput.value) {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        dateInput.min = `${y}-${m}-${d}`; 
        dateInput.value = `${y}-${m}-${d}`;
    }

    if (services.length === 1) {
        select.selectedIndex = 0;
    }
    updateServiceSelection();
}

function updateServiceSelection() {
    const select = document.getElementById('select-service');
    const headline = document.getElementById('table-headline');
    if (select && select.value) {
        const service = services.find(s => s.id == select.value);
        if (service && headline) {
            headline.innerText = `Service: ${service.name} (Durée : ${service.duration} min)`;
        }
    }
    loadAvailableTimeSlots();
}

window.updateServiceSelection = updateServiceSelection;
window.loadAvailableTimeSlots = loadAvailableTimeSlots;




function loadAvailableTimeSlots() {
    const tableBody = document.getElementById('available-slots-table-body');
    const tableWrapper = document.getElementById('table-wrapper');
    const msg = document.getElementById('slots-loading-message');
    const select = document.getElementById('select-service');
    const dateInput = document.getElementById('appointment-date');
    const bookingForm = document.getElementById('booking-form-section');

    if (!tableBody || !tableWrapper || !msg || !select || !dateInput) return;

    // Réinitialisation complète de l'affichage
    tableBody.innerHTML = '';
    tableWrapper.style.display = 'none';
    if (bookingForm) bookingForm.classList.add('hidden');
    selectedTimeSlotMinutes = null;

    // Validation des entrées de l'utilisateur
    if (!select.value || !dateInput.value) {
        msg.innerText = "Please select a service and a valid date.";
        msg.style.display = 'block';
        return;
    }

    const service = services.find(s => s.id == select.value);
    if (!service) return;

    // Correction du bug de fuseau horaire lors de l'extraction du jour de la semaine
    const [year, month, day] = dateInput.value.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day); 

    const pauseLimits = getPauseAndClosureLimits();
    if (pauseLimits.closedDays.includes(targetDate.getDay())) {
        msg.textContent = "Sorry, we're closed on this day.";
        msg.style.display = 'block';
        return;
    }

    const salonLimits = getSalonLimits();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const currentMinutes = (now.getHours() * 60) + now.getMinutes();
    const isToday = (dateInput.value === todayStr);

    let hasAnyAvailableSlot = false;
    const fragment = document.createDocumentFragment(); // Gain de performance DOM

    // CONFIGURATION DU PAS GLISSANT : Avancer de 5 en 5 minutes pour coller au plus près des fins de services
    const TIME_STEP = 5; 

    for (
        let startMin = salonLimits.open;
        startMin <= salonLimits.close - service.duration;
        startMin += TIME_STEP // <-- C'est ce pas glissant qui supprime les minutes perdues !
    ) {
        const endMin = startMin + service.duration;

        // Éviter de déborder des horaires de fermeture globale du salon
        if (endMin > salonLimits.close) {
            continue;
        }

        // Vérification stricte de la pause déjeuner
        const overlapPause = (startMin < pauseLimits.end && endMin > pauseLimits.start);
        if (overlapPause) {
            continue;
        }

        // CORRECTION LOGIQUE : Trouver les employés disponibles du début À la fin sans coupure
        let availableEmployees = [];
        let firstMinute = true;
        let slotAvailable = true;

        for (let minute = startMin; minute < endMin; minute++) {
            const freeEmployees = getAvailableEmployeesAtMinute(minute, dateInput.value, service.id);
            
            if (!freeEmployees || freeEmployees.length === 0) {
                slotAvailable = false;
                break;
            }

            if (firstMinute) {
                availableEmployees = freeEmployees;
                firstMinute = false;
            } else {
                // Règle d'intersection : l'employé doit rester le même sur toute la durée du soin
                availableEmployees = availableEmployees.filter(emp => freeEmployees.includes(emp));
                if (availableEmployees.length === 0) {
                    slotAvailable = false;
                    break;
                }
            }
        }

        // Définir si le créneau est dans le passé (pour le jour même)
        const isPastSlot = isToday && startMin <= currentMinutes;
        const row = document.createElement('tr');
        const startStr = minutesToHHMM(startMin);
        const endStr = minutesToHHMM(endMin);

        if (slotAvailable && !isPastSlot) {
            hasAnyAvailableSlot = true;
            
            row.innerHTML = `
                <td class="time-range">${startStr} - ${endStr}</td>
                <td><span class="status-badge status-available">available</span></td>
                <td class="action-cell"></td>
            `;

            const btn = document.createElement('button');
            btn.className = "btn btn-secondary btn-select-slot";
            btn.innerText = "select";
            btn.dataset.start = startMin;

            btn.onclick = function(e) {
                e.preventDefault();
                // Nettoyer les anciennes sélections visuelles
                tableBody.querySelectorAll('tr').forEach(r => r.style.backgroundColor = '');
                
                row.style.backgroundColor = '#fff9e6';
                selectedTimeSlotMinutes = Number(this.dataset.start);

                const hourInput = document.getElementById('client-selected-hour');
                if (hourInput) hourInput.value = startStr;

                if (bookingForm) {
                    bookingForm.classList.remove('hidden');
                    bookingForm.scrollIntoView({ behavior: 'smooth' });
                }
            };

            const staffInfo = document.createElement('span');
            staffInfo.className = "staff-count";
            staffInfo.innerText = `(${availableEmployees.length} available)`;

            const actionCell = row.querySelector('.action-cell');
actionCell.appendChild(btn);
actionCell.appendChild(staffInfo);

fragment.appendChild(row);

} else {

    // Si tu veux afficher les créneaux occupés, décommente ce bloc.
    // Sinon, laisse simplement ce else vide.

    
    row.innerHTML = `
        <td class="time-range" style="color:#999; text-decoration:line-through;">
            ${startStr} - ${endStr}
        </td>
        <td><span class="status-badge status-busy">Booked</span></td>
        <td><span style="color:#c81e1e; font-size:13px;">
            ${isPastSlot ? "Past" : "Unavailable"}
        </span></td>
    `;
    fragment.appendChild(row);
    
}

} // fin de la boucle for

// Injection en une seule fois dans le DOM
tableBody.appendChild(fragment);

// Message dynamique ajusté selon la date sélectionnée
if (!hasAnyAvailableSlot) {
        msg.innerText = isToday 
            ? "No more available slots for today. Please choose another date. 😊" 
            : ".No available slots for this date. Please select another day";
        msg.style.display = 'block';
        return;
    }

    msg.style.display = 'none';
    tableWrapper.style.display = 'block';
}

function isEmployeeAvailable(emp, dateISO, startMin, endMin) {
    return !clients.some(c =>
        c.employeeId === emp.id &&
        c.dateISO === dateISO &&
        startMin < c.endMin &&
        endMin > c.startMin
    );
}

function confirmClientBooking() {
    const select = document.getElementById('select-service');
    const dateInput = document.getElementById('appointment-date');
    const clientName = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();

    if (!clientName || !phone) {
        alert("Please enter your full name and phone number to confirm your booking.");
        return;
    }
    if (selectedTimeSlotMinutes === null) {
        alert("Please select an available time slot from the schedule above.");
        return;
    }

    const service = services.find(s => s.id == select.value);
let startMin = parseInt(selectedTimeSlotMinutes, 10);
const endMin = startMin + service.duration;
    const assignedEmployee = findAvailableEmployee(
    service.id,
    dateInput.value,
    startMin,
    endMin
);

if (!assignedEmployee) {
    alert("No staff member is available for this time slot..");
    return;
}

    const [year, month, day] = dateInput.value.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    const ticketNumber = "TK-" + Math.floor(100000 + Math.random() * 900000);

    push(ref(database, 'clients'), {
    clientName: clientName,
    clientPhone: phone,
    serviceName: service.name,
serviceId: service.id,
    duration: service.duration,

    startMin: startMin,
    endMin: endMin,

    timeStartStr: minutesToHHMM(startMin),
    timeEndStr: minutesToHHMM(endMin),

    dateISO: dateInput.value,
    dateFormatted: formattedDate,

    ticket: ticketNumber,

    employeeId: assignedEmployee.id,
    employeeName: assignedEmployee.name
})
.then(() => {
        alert("Congratulations! We have successfully received your booking.");

        document.getElementById('ticket-content').innerHTML = `
            <strong>ticket number :</strong> ${ticketNumber}<br>
            <strong>nom :</strong> ${clientName}<br>
            <strong>Téléphone :</strong> ${phone}<br>
            <hr style="border:1px dashed #e0e0e0; margin:10px 0;">
            <strong>service :</strong> ${service.name}<br>
            <strong>data de appointment.:</strong> ${formattedDate}<br>
            <strong>Appointment time: </strong> de ${minutesToHHMM(startMin)} à ${minutesToHHMM(endMin)}
        `;

        const timeBeforeStr = minutesToHHMM(startMin - 5);
        document.getElementById('time-reminder-msg').innerText =
`Please arrive 5 minutes before your appointment time for a smooth service. That is at ${timeBeforeStr}.`;

        document.getElementById('success-modal').classList.remove('hidden');

}).catch((error) => {
    alert("Erreur Firebase : " + error.message);
    console.error(error);
});
}


function confirmCancellation() {
    const answer = confirm(
        "Are you sure you want to cancel your appointment."
    );

    if (answer) {
        triggerCancelProcess();
    }
}



function triggerCancelProcess() {

    if (!currentActiveReservationId) {
        alert("no bookings founds.");
        return;
    }

    remove(ref(database, `clients/${currentActiveReservationId}`))
    .then(() => {

        document.getElementById('success-modal').classList.add('hidden');

        document.getElementById('cancel-reason-modal').classList.remove('hidden');

    })
    .catch(error => {
        console.error(error);
        alert("Une erreur est survenue lors de l'annulation.");
    });
}
function submitCancellationReason() {
    const reasonValue = document.getElementById('cancel-reason').value.trim();
    if(reasonValue) {
        push(ref(database, 'cancellations'), {
            date: new Date().toISOString(),
            reason: reasonValue
        });
    }
    document.getElementById('cancel-reason').value = '';
    document.getElementById('cancel-reason-modal').classList.add('hidden');
    clearFormFields();
}

function closeSuccessModal() {
    document.getElementById('success-modal').classList.add('hidden');
    clearFormFields();
}

function clearFormFields() {
    document.getElementById('client-name').value = '';
    document.getElementById('client-phone').value = '';
    document.getElementById('client-selected-hour').value = '';
    selectedTimeSlotMinutes = null;
    currentActiveReservationId = null;
}

window.confirmClientBooking = confirmClientBooking;
window.confirmCancellation = confirmCancellation;
window.triggerCancelProcess = triggerCancelProcess;
window.submitCancellationReason = submitCancellationReason;
window.closeSuccessModal = closeSuccessModal;
window.cancelBookingById = cancelBookingById;


function searchMyBookings() {
    const phone = document.getElementById('search-phone').value.trim();
    const container = document.getElementById('my-bookings-list');

    if (!phone) {
        alert("please enter your phone number.");
        return;
    }

    const myBookings = clients.filter(
        c => c.clientPhone === phone
    );

    if (myBookings.length === 0) {
        container.innerHTML =
            "<p class='no-data'>no bookings founds.</p>";
        return;
    }

    let html = `
        <table class="schedule-table">
            <thead>

<tr>
    <th>Service</th>
    <th>Date</th>
    <th>Heure</th>
    <th>Ticket</th>
    <th>Action</th>
</tr>
            </thead>
            <tbody>
    `;

    myBookings.forEach(b => {
        html += `
           <tr>
    <td>${b.serviceName}</td>
    <td>${b.dateFormatted}</td>
    <td>${b.timeStartStr} - ${b.timeEndStr}</td>
    <td>${b.ticket || "-"}</td>
    <td>
        <button
            class="btn btn-danger"
            onclick="cancelBookingById('${b.id}')">
            Annuler
        </button>
    </td>
</tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

window.searchMyBookings = searchMyBookings;


document.addEventListener('DOMContentLoaded', () => {
    initClientPage();
});



function getAvailableEmployeesAtMinute(minute, dateTarget, serviceId) {

    const service = services.find(s => s.id === serviceId);

    if (!service) return [];

    const startMin = minute;
const endMin = startMin + service.duration;

    return employees.filter(emp => {

        const canDoService =
            emp.polyvalent ||
            (
                Array.isArray(emp.services) &&
                emp.services.includes(service.name)
            );

        if (!canDoService) return false;

        const hasConflict = clients.some(c =>
            c.employeeId === emp.id &&
            c.dateISO === dateTarget &&
            startMin < c.endMin &&
            endMin > c.startMin
        );

        return !hasConflict;
    });
}




function findAvailableEmployee(serviceId, dateISO, startMin, endMin) {

    const eligibleEmployees = employees.filter(emp =>
        emp.polyvalent ||
   (
    Array.isArray(emp.services) &&
    emp.services.includes(
        services.find(s => s.id === serviceId)?.name
    )
)
    );

    for (const emp of eligibleEmployees) {

        const busy = clients.some(c =>
            c.employeeId === emp.id &&
            c.dateISO === dateISO &&
            !(endMin <= c.startMin || startMin >= c.endMin)
        );

        if (!busy) {
            return emp;
        }
    }

    return null;
}

function generateDynamicSlots(serviceDuration, dateISO, salonOpen, salonClose, bookedSlots) {

    const slots = [];

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let cursor = salonOpen;

    // 🔥 si aujourd’hui → départ = maintenant
    if (dateISO === todayStr) {
        cursor = Math.max(cursor, now.getHours() * 60 + now.getMinutes());
    }

    const sortedBookings = [...bookedSlots].sort((a, b) => a.startMin - b.startMin);

    while (cursor + serviceDuration <= salonClose) {

        const start = cursor;
        const end = start + serviceDuration;

        // ❌ collision avec réservations Firebase
        const conflict = sortedBookings.some(b =>
            !(end <= b.startMin || start >= b.endMin)
        );

        if (!conflict) {
            slots.push({ start, end });
            cursor = end; // 🔥 avance après slot validé
        } else {
            cursor += 5; // 🔥 recherche fine (5 min)
        }
    }

    return slots;
}
