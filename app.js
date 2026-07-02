document.addEventListener('DOMContentLoaded', () => {
  const btnAdmin = document.getElementById('btn-admin');
  const btnEntrer = document.getElementById('btn-entrer');
  
  // Bouton Admin
  btnAdmin.addEventListener('click', () => {
    window.location.href = 'admin.html';
  });
  
  // Bouton Entrer
  btnEntrer.addEventListener('click', () => {
    window.location.href = 'client.html';
  });
  
  // Slider automatique
  const gallery = document.querySelector('.gallery');
  const images = document.querySelectorAll('.gallery img');
  
  if (gallery && images.length > 0) {
    let currentIndex = 0;
    
    function showSlide(index) {
      gallery.style.transform = `translateX(-${index * 100}vw)`;
    }
    
    setInterval(() => {
      currentIndex++;
      
      if (currentIndex >= images.length) {
        currentIndex = 0;
      }
      
      showSlide(currentIndex);
    }, 2000); // change de photo toutes les 3 secondes
  }
});
