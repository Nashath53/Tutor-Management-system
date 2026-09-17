document.addEventListener("DOMContentLoaded", () => {
  // 1. Typing effect for Hero
  const typingTarget = document.getElementById("typing-text");
  if (typingTarget) {
    const phrases = ["Learn.", "Grow.", "Excel."];
    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function typeLoop() {
      const currentPhrase = phrases[phraseIdx];
      if (!isDeleting) {
        typingTarget.textContent = currentPhrase.substring(0, charIdx + 1);
        charIdx++;
        if (charIdx === currentPhrase.length) {
          isDeleting = true;
          setTimeout(typeLoop, 1200);
          return;
        }
      } else {
        typingTarget.textContent = currentPhrase.substring(0, charIdx - 1);
        charIdx--;
        if (charIdx === 0) {
          isDeleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
        }
      }
      setTimeout(typeLoop, isDeleting ? 60 : 120);
    }
    typeLoop();
  }

  // 2. Form validation
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!contactForm.checkValidity()) {
        e.stopPropagation();
      } else {
        alert("Thank you! Your inquiry has been sent.");
        contactForm.reset();
      }
      contactForm.classList.add("was-validated");
    });
  }

  // 3. Blog filter
  const filterBtns = document.querySelectorAll(".filter-btn");
  const blogCards = document.querySelectorAll(".blog-item");

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active", "btn-primary"));
      filterBtns.forEach((b) => b.classList.add("btn-outline-primary"));
      btn.classList.add("active", "btn-primary");
      btn.classList.remove("btn-outline-primary");

      const category = btn.getAttribute("data-filter");
      blogCards.forEach((card) => {
        if (category === "all" || card.getAttribute("data-category") === category) {
          card.classList.remove("d-none");
        } else {
          card.classList.add("d-none");
        }
      });
    });
  });
});
