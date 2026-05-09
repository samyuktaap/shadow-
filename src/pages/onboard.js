document.addEventListener('DOMContentLoaded', () => {
  let currentStep = 1;
  const totalSteps = 3;

  const btnNext = document.getElementById('btn-next');
  const btnStart = document.getElementById('btn-start');
  const dots = document.querySelectorAll('.dot');

  btnNext.onclick = () => {
    if (currentStep < totalSteps) {
      document.getElementById(`step-${currentStep}`).classList.remove('active');
      document.getElementById(`step-${currentStep}`).classList.add('prev');
      
      currentStep++;
      
      document.getElementById(`step-${currentStep}`).classList.add('active');
      
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentStep - 1);
      });

      if (currentStep === totalSteps) {
        btnNext.style.display = 'none';
        btnStart.style.display = 'block';
      }
    }
  };

  btnStart.onclick = () => {
    // Close the onboarding tab
    window.close();
  };
});
