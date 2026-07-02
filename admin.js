import { database, ref, set, push, onValue, remove } from "./firebase-config.js";




let salonConfig = {
    days: "",
    hours: "09:00 - 19:00",
    break: ""
};

onValue(ref(database, 'salon_config'), (snapshot) => {
    const data = snapshot.val();
    
    salonConfig = {
        days: data?.days || "",
        hours: data?.hours || "09:00 - 19:00",
        break: data?.break || ""
    };
    
    const d = document.getElementById('salon-days');
    const h = document.getElementById('salon-hours');
    const b = document.getElementById('salon-break');
    
    if (d) d.value = salonConfig.days;
    if (h) h.value = salonConfig.hours;
    if (b) b.value = salonConfig.break;
    
    if (typeof loadAvailableTimeSlots === "function") loadAvailableTimeSlots();
    if (typeof renderServiceSchedules === "function") renderServiceSchedules();
});




let services = [];
let employees = [];
let clients = [];
let currentMode = 'auto';

















const DAYS_MAP = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 };


// Écoute en temps réel des services
onValue(ref(database, 'services'), (snapshot) => {
    const data = snapshot.val();
    
    services = [];
    
    if (data) {
        Object.keys(data).forEach(key => {
            services.push({ id: key, ...data[key] });
        });
    }
    
    renderServices();
    renderServiceSchedules();
});



onValue(ref(database,'employees'), snapshot => {

    const data = snapshot.val();

    employees = [];

    if(data){

        Object.keys(data).forEach(key=>{

            employees.push({
                id:key,
                ...data[key]
            });

        });

    }

    renderEmployees();

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

    renderClients();

    renderServiceSchedules();
});

function saveSalonHours() {
    const days = document.getElementById('salon-days').value;
    const hours = document.getElementById('salon-hours').value;
    const breakVal = document.getElementById('salon-break').value;
    
    set(ref(database, 'salon_config'), {
        days: days,
        hours: hours,
        break: breakVal
    }).then(() => {
        alert(' Schedule configuration successfully saved to the server😊')

    });
}







 
function minutesToHHMM(totalMinutes) {
    let hours = Math.floor(totalMinutes / 60);
    let minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getSalonLimits() {
    let open = 9 * 60;
    let close = 19 * 60;

    const matches = (salonConfig.hours || "").match(/\d{2}:\d{2}/g);

    if (matches && matches.length >= 2) {
        open = hhmmToMinutes(matches[0]);
        close = hhmmToMinutes(matches[1]);
    }

    return { open, close };
}



function getPauseAndClosureLimits() {
    let pauseStart = 12 * 60 + 30;
    let pauseEnd = 13 * 60 + 30;
    let closedDays = [];

    const text = (salonConfig.break || "").toLowerCase();

    const matches = text.match(/\d{2}:\d{2}/g);

    if (matches && matches.length >= 2) {
        pauseStart = hhmmToMinutes(matches[0]);
        pauseEnd = hhmmToMinutes(matches[1]);
    }

    for (const [day, index] of Object.entries(DAYS_MAP)) {
        if (text.includes(day)) {
            closedDays.push(index);
        }
    }

    if (closedDays.length === 0) closedDays = [0];

    return {
        start: pauseStart,
        end: pauseEnd,
        closedDays: closedDays
    };
}
function formatDateISOToLocal(dateStr) {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function renderServices() {
    const list = document.getElementById('services-list');
    const selectClient = document.getElementById('client-service');
    if (!list || !selectClient) return;
    
    list.innerHTML = '';
    selectClient.innerHTML = '';

    if (services.length === 0) {
        list.innerHTML = '<p class="no-data">No services available. Add one above..</p>';
        selectClient.innerHTML = '<option value="">-- No services available --</option>';
     updateDurationHint();


        return;
    }

    services.forEach(s => {
        list.innerHTML += `
            <div class="list-item">
                <span><strong>${s.name}</strong> (${s.duration} min) - <em>${s.capacity} emp.</em></span>
                <div>
                    <button class="btn btn-secondary" style="padding: 5px 10px; font-size:12px;" onclick="editService('${s.id}')">edit</button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size:12px;" onclick="deleteService('${s.id}')">delete</button>
                </div>
            </div>
        `;
        selectClient.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    updateDurationHint();
}

function addService() {
    const nameInput = document.getElementById('service-name');
    const durationInput = document.getElementById('service-duration');

    const name = nameInput.value.trim();
    const duration = parseInt(durationInput.value);

    if (!name) {
        alert("please enter the service name.");
        return;
    }

    if (isNaN(duration) || duration <= 0) {
        alert("please enter a valid duration.");
        return;
    }

    push(ref(database, 'services'), {
        name: name,
        duration: duration
        // ❌ plus de capacity ici
    }).then(() => {
        nameInput.value = '';
        durationInput.value = '';
        alert("Service successfully added !");
    });
}


function getServiceCapacity(serviceName) {

    return employees.filter(emp =>
        emp.polyvalent === true ||
        (Array.isArray(emp.services) &&
         emp.services.includes(serviceName))
    ).length;

}
function deleteService(id) {
    remove(ref(database, `services/${id}`))
        .then(() => {
            // Mettre à jour l'affichage après suppression
            services = services.filter(s => s.id !== id); // supprime aussi localement
            renderServices();
        })
        .catch((error) => {
            console.error("Erreur lors de la suppression :", error);
            alert("Impossible de delete le service pour le moment.");
        });
}

function updateDurationHint() {
    const select = document.getElementById('client-service');
    const hint = document.getElementById('duration-hint');
    if (select && hint) {
        if (select.value) {
            const service = services.find(s => s.id == select.value);
            hint.innerText = service ? service.duration : "0";
        } else {
            hint.innerText = "0";
        }
    }
}

function switchClientMode(mode) {
    currentMode = mode;
    document.getElementById('tab-auto').classList.toggle('active', mode === 'auto');
    document.getElementById('tab-manual').classList.toggle('active', mode === 'manual');
    document.getElementById('form-auto').classList.toggle('hidden', mode !== 'auto');
    document.getElementById('form-manual').classList.toggle('hidden', mode !== 'manual');
}

window.saveSalonHours = saveSalonHours;
window.addService = addService;
window.deleteService = deleteService;
window.editService = editService;
window.updateDurationHint = updateDurationHint;
window.switchClientMode = switchClientMode;
window.addEmployee = addEmployee;
window.deleteEmployee = deleteEmployee;

function countOccupiedStaffForService(serviceName, checkMinutes, dateTarget) {

    const occupiedEmployees = new Set();

    clients.forEach(client => {

        if (
            client.dateISO === dateTarget &&
            checkMinutes >= client.startMin &&
            checkMinutes < client.endMin
        ) {

            const employee = employees.find(
                emp => emp.id === client.employeeId
            );

            if (!employee) return;

            const canDoService =
                employee.polyvalent === true ||
                (
                    Array.isArray(employee.services) &&
                    employee.services.includes(serviceName)
                );

            if (canDoService) {
                occupiedEmployees.add(employee.id);
            }
        }
    });

    return occupiedEmployees.size;
}
function findNextFreeSlot(dateTarget, serviceObj) {

    const salonLimits = getSalonLimits();
    const pauseLimits = getPauseAndClosureLimits();

    let startMinutes = salonLimits.open;

    const now = new Date();

    const todayStr =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Si c'est aujourd'hui, commencer à l'heure actuelle
    if (dateTarget === todayStr) {

        const currentMinutes =
            (now.getHours() * 60) + now.getMinutes();

        if (currentMinutes > startMinutes) {
            startMinutes = currentMinutes;
        }
    }

    while (startMinutes < salonLimits.close) {

        const endMinutes =
            startMinutes + serviceObj.duration;

        // Fin de journée
        if (endMinutes > salonLimits.close) {
            return null;
        }

        // Vérification pause déjeuner
        if (
            (
                startMinutes >= pauseLimits.start &&
                startMinutes < pauseLimits.end
            )
            ||
            (
                endMinutes > pauseLimits.start &&
                endMinutes <= pauseLimits.end
            )
            ||
            (
                startMinutes <= pauseLimits.start &&
                endMinutes >= pauseLimits.end
            )
        ) {

            startMinutes = pauseLimits.end;
            continue;
        }

        let slotIsAvailable = true;

        // Vérification minute par minute
        for (
            let minute = startMinutes;
            minute < endMinutes;
            minute++
        ) {

            const staffOccupied =
                countOccupiedStaffForService(
                    serviceObj.name,
                    minute,
                    dateTarget
                );

            const availableEmployees = employees.filter(emp =>
    emp.polyvalent === true ||
    (
        Array.isArray(emp.services) &&
        emp.services.includes(serviceObj.name)
    )
);

const totalCapacity = availableEmployees.length;

if (staffOccupied >= totalCapacity) {
                slotIsAvailable = false;

                // Tester la minute suivante
                startMinutes++;

                break;
            }
        }

        if (slotIsAvailable) {
            return startMinutes;
        }
    }

    return null;
}


function addClient() {

    const select = document.getElementById('client-service');

    if (!select || !select.value) {
        alert("please add service first.");
        return;
    }

    const service =
        services.find(s => s.id == select.value);

    const salonLimits =
        getSalonLimits();

    const pauseLimits =
        getPauseAndClosureLimits();

    let calculatedStartMin = 0;
    let dateISOValue = "";

    if (currentMode === 'auto') {

        let targetDate = new Date();
        let attempts = 0;

        while (attempts < 30) {

            if (
                pauseLimits.closedDays.includes(
                    targetDate.getDay()
                )
            ) {

                targetDate.setDate(
                    targetDate.getDate() + 1
                );

                attempts++;
                continue;
            }

            let y =
                targetDate.getFullYear();

            let m =
                String(
                    targetDate.getMonth() + 1
                ).padStart(2, '0');

            let d =
                String(
                    targetDate.getDate()
                ).padStart(2, '0');

            let dateStr =
                `${y}-${m}-${d}`;

            let slotMin =
                findNextFreeSlot(
                    dateStr,
                    service
                );

            if (slotMin !== null) {

                calculatedStartMin =
                    slotMin;

                dateISOValue =
                    dateStr;

                break;
            }

            targetDate.setDate(
                targetDate.getDate() + 1
            );

            attempts++;
        }

        if (dateISOValue === "") {

            alert(
                "Aucune disponibilité trouvée."
            );

            return;
        }

    } else {

        const dateIn =
            document.getElementById(
                'client-date'
            );

        const timeIn =
            document.getElementById(
                'client-time'
            );

        if (
            !dateIn ||
            !timeIn ||
            !dateIn.value ||
            !timeIn.value
        ) {

            alert("Champs vides.");
            return;
        }

        dateISOValue =
            dateIn.value;

        const [y, m, d] =
            dateISOValue.split('-');

        const selectedDate =
            new Date(
                y,
                m - 1,
                d
            );

        if (
            pauseLimits.closedDays.includes(
                selectedDate.getDay()
            )
        ) {

            alert("Salon fermé.");
            return;
        }

        calculatedStartMin =
            hhmmToMinutes(
                timeIn.value
            );

        const calculatedEndMin =
            calculatedStartMin +
            service.duration;

        // Vérification schedules salon

        if (
            calculatedStartMin <
                salonLimits.open ||
            calculatedEndMin >
                salonLimits.close
        ) {

            alert(
                "Outside of opening hours."
            );

            return;
        }

        // Vérification pause

        if (
            (
                calculatedStartMin >=
                    pauseLimits.start &&
                calculatedStartMin <
                    pauseLimits.end
            )
            ||
            (
                calculatedEndMin >
                    pauseLimits.start &&
                calculatedEndMin <=
                    pauseLimits.end
            )
            ||
            (
                calculatedStartMin <=
                    pauseLimits.start &&
                calculatedEndMin >=
                    pauseLimits.end
            )
        ) {

            alert(
                "Créneau pendant la pause."
            );

            return;
        }

        // Vérification capacité

        for (
            let minute =
                calculatedStartMin;
            minute <
                calculatedEndMin;
            minute++
        ) {

            const occupied =
                countOccupiedStaffForService(
                    service.name,
                    minute,
                    dateISOValue
                );

            if (
                occupied >=
                getServiceCapacity(service.name)
            ) {

                alert(
                    "Créneau déjà complet."
                );

                return;
            }
        }
    }

    let calculatedEndMin =
        calculatedStartMin +
        service.duration;
        
        const assignedEmployee =
    findAvailableEmployee(
        service.name,
        dateISOValue,
        calculatedStartMin,
        calculatedEndMin
    );

if (!assignedEmployee) {

    alert(
        "Aucun  disponible sur ce créneau."
    );

    return;
}
        

    push(
        ref(database, 'clients'),
        {
            service:
                service.name,

            duration:
                service.duration,

employeeId:
    assignedEmployee.id,

employeeName:
    assignedEmployee.name,
            startMin:
                calculatedStartMin,

            endMin:
                calculatedEndMin,

            timeStartStr:
                minutesToHHMM(
                    calculatedStartMin
                ),

            timeEndStr:
                minutesToHHMM(
                    calculatedEndMin
                ),

            dateISO:
                dateISOValue,

            dateFormatted:
                formatDateISOToLocal(
                    dateISOValue
                )
        }
    )
    .then(() => {

        alert(
            "Appointment successfully booked !"
        );

    })
    .catch((error) => {

        console.error(error);

        alert(
            "Erreur lors de l'enregistrement."
        );

    });
}

function loginAdmin() {

    const password =
        document.getElementById("admin-password").value;

    if(password === "DOG2026") {

        document.getElementById("login-screen").style.display = "none";

        document.getElementById("admin-content").style.display = "block";

    } else {

        alert("Code d'accès incorrect");

    }
}

window.loginAdmin = loginAdmin;




function deleteClient(id) {
    remove(ref(database, `clients/${id}`));
}

window.addClient = addClient;
window.deleteClient = deleteClient;

document.addEventListener('DOMContentLoaded', () => {
    renderServices();
    renderClients();
    const clientDateInput = document.getElementById('client-date');
    if (clientDateInput) clientDateInput.valueAsDate = new Date();
    
    // Remplacement du onclick natif HTML pour Firebase
    const saveBtn = document.querySelector("button[onclick*='alert']");
    if (saveBtn) saveBtn.setAttribute("onclick", "saveSalonHours()");
});







function renderServiceSchedules() {
    const container = document.getElementById('service-schedules-container');
    if (!container) return;

    container.innerHTML = ''; // vide le conteneur avant de remplir

    services.forEach(service => {
        // clients pour ce service
        const serviceClients = clients
    .filter(c =>
        c.service === service.name ||
        c.serviceName === service.name
    )
    .sort((a,b) =>
        a.dateISO.localeCompare(b.dateISO) ||
        a.startMin - b.startMin
    );

        // Création d’une carte pour le service
        const card = document.createElement('div');
        card.classList.add('booking-form-card');
        card.style.marginBottom = '25px';

        // Titre
        const title = document.createElement('h3');
        title.innerText = `Schedule : ${service.name} (Durée ${service.duration} min)`;
        card.appendChild(title);

        // Si aucun client
        if (serviceClients.length === 0) {
            const noData = document.createElement('p');
            noData.classList.add('no-data');
            noData.innerText = 'No customers for this service';
            card.appendChild(noData);
        } else {
            // Tableau pro
            const table = document.createElement('table');
            table.classList.add('schedule-table'); // utiliser ton style existant
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';

            // En-tête
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background-color: #4a3b32; color: white;">
                    <th style="padding:10px;">name</th>
                    <th style="padding:10px;">phone number</th>
                    <th style="padding:10px;">Date</th>
                  <th style="padding:10px;">schedule</th>
<th style="padding:10px;">employee</th>
<th style="padding:10px;">Action</th>
                </tr>
            `;
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            serviceClients.forEach(c => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #ddd';
                tr.innerHTML = `
                    <td style="padding:10px;">${c.clientName || '-'}</td>
                    <td style="padding:10px; color:#1abc9c; font-weight:bold;">${c.clientPhone || '-'}</td>
                    <td style="padding:10px;">${c.dateFormatted}</td>
<td style="padding:10px;">
    ${c.timeStartStr} - ${c.timeEndStr}
</td>

<td style="padding:10px;">
    ${c.employeeName || "-"}
</td>

<td style="padding:10px;">
                        <button class="btn btn-danger" onclick="deleteClient('${c.id}')">delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            card.appendChild(table);
        }

        container.appendChild(card);
    });
}

// Appel automatique après récupération des clients et services





function hhmmToMinutes(timeStr) {

    if (!timeStr) return 0;

    const [hours, minutes] =
        timeStr.split(':').map(Number);

    return (hours * 60) + minutes;
}


function renderClients() {
    // Fonction vide temporaire
}

function renderEmployees() {
    const container = document.getElementById('employees-list');
    const serviceBox = document.getElementById('employee-services-list');

    if (!container || !serviceBox) return;

    serviceBox.innerHTML = '';

    services.forEach(s => {
        const btn = document.createElement('button');
        btn.type = "button";
        btn.className = "btn btn-secondary";
        btn.style.margin = "4px";
        btn.dataset.selected = "0";
        btn.innerText = s.name;

        btn.onclick = () => {
            btn.dataset.selected = btn.dataset.selected === "1" ? "0" : "1";
            btn.style.background = btn.dataset.selected === "1" ? "#4a3b32" : "";
            btn.style.color = btn.dataset.selected === "1" ? "#fff" : "";
        };

        serviceBox.appendChild(btn);
    });

    container.innerHTML = '';

    if (employees.length === 0) {
        container.innerHTML = "<p class='no-data'>Aucun  ajouté</p>";
        return;
    }

    employees.forEach(e => {
    container.innerHTML += `
        <div class="list-item">
            <span>
                <strong>${e.name}</strong>
                ${e.polyvalent ? "(Polyvalent)" : ""}
                <br>
                <small>Services: ${e.services?.join(", ") || "-"}</small>
            </span>

            <div>
                <button class="btn btn-danger"
                    style="padding:5px 10px; font-size:12px;"
                    onclick="deleteEmployee('${e.id}')">
                    delete
                </button>
            </div>
        </div>
    `;
});
}
function addEmployee() {
    const name = document.getElementById('employee-name').value.trim();
    const polyvalent = document.getElementById('employee-polyvalent').checked;

    const selectedServices = Array.from(
    document.querySelectorAll('#employee-services-list button')
)
.filter(btn => btn.dataset.selected === "1")
.map(btn => btn.innerText);

    if (!name) {
        alert("please enter the employee's name");
        return;
    }

    if (!polyvalent && selectedServices.length === 0) {
        alert("Sélectionnez au moins un service ou cochez polyvalent");
        return;
    }

    push(ref(database, 'employees'), {
        name: name,
        polyvalent: polyvalent,
        services: polyvalent ? [] : selectedServices
    }).then(() => {
        document.getElementById('employee-name').value = '';
        document.getElementById('employee-polyvalent').checked = false;
    });
}



function deleteEmployee(id) {
    const confirmDelete = confirm("delete this employee ?");
    if (!confirmDelete) return;

    remove(ref(database, `employees/${id}`))
        .then(() => {
            alert("Employee successfully deleted !");
        })
        .catch(error => {
            console.error(error);
            alert("Erreur lors de la suppression.");
        });
}



function getAvailableEmployeesAtMinute(minute, dateTarget, serviceName) {

    const busyEmployees = new Set();

    clients.forEach(c => {
        if (c.dateISO === dateTarget) {
            if (minute >= c.startMin && minute < c.endMin) {
                busyEmployees.add(c.employeeId);
            }
        }
    });

    return employees.filter(emp =>
        !busyEmployees.has(emp.id) &&
        (emp.polyvalent === true ||
        (Array.isArray(emp.services) &&
         emp.services.includes(serviceName)))
    );
}



function findAvailableEmployee(serviceName, dateISO, startMin, endMin) {

    const eligibleEmployees = employees.filter(emp =>
        emp.polyvalent === true ||
        (Array.isArray(emp.services) &&
         emp.services.includes(serviceName))
    );

    for (const emp of eligibleEmployees) {

        const isBusy = clients.some(client =>
            client.employeeId === emp.id &&
            client.dateISO === dateISO &&
            startMin < client.endMin &&
            endMin > client.startMin
        );

        if (!isBusy) {
            return emp;
        }
    }

    return null;
}




function editService(serviceId) {
    
    const service = services.find(s => s.id === serviceId);
    
    if (!service) {
        alert("Service introuvable");
        return;
    }
    
    const newName = prompt("service name :", service.name);
    if (!newName) return;
    
    const newDuration = prompt("Durée (minutes) :", service.duration);
    if (!newDuration || isNaN(newDuration)) {
        alert("Durée invalide");
        return;
    }
    
    const updatedService = {
        name: newName.trim(),
        duration: Number(newDuration),
        updatedAt: Date.now()
    };
    
    const serviceRef = ref(database, `services/${serviceId}`);
    
    set(serviceRef, updatedService)
        .then(() => {
            alert("Service mis à jour !");
            renderServices(); // ✅ CORRECTION ICI
            loadAvailableTimeSlots(); // OK si existe
        })
        .catch((error) => {
            console.error(error);
            alert("ok");
        });
}
