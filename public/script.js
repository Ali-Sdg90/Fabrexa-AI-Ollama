const menuButton = document.querySelector("[data-menu-button]");
const navigation = document.querySelector("[data-nav]");
const revealItems = document.querySelectorAll("[data-reveal]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

revealItems.forEach((item) => {
    const delay = Number(item.dataset.revealDelay || 0);
    item.style.setProperty("--reveal-delay", `${delay}ms`);
});

if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                revealObserver.unobserve(entry.target);
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -48px" },
    );

    revealItems.forEach((item) => revealObserver.observe(item));
}

function closeMenu() {
    menuButton?.setAttribute("aria-expanded", "false");
    navigation?.classList.remove("is-open");
}

menuButton?.addEventListener("click", () => {
    const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(willOpen));
    navigation?.classList.toggle("is-open", willOpen);
});

navigation?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
});

document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
        const target = document.getElementById(button.dataset.copy);
        const value = target?.textContent.trim();
        if (!value) return;

        try {
            await navigator.clipboard.writeText(value);
            button.textContent = "Copied";
            button.classList.add("is-copied");
            window.setTimeout(() => {
                button.textContent = "Copy";
                button.classList.remove("is-copied");
            }, 1600);
        } catch {
            button.textContent = "Select text";
        }
    });
});

document.querySelectorAll("[data-year]").forEach((item) => {
    item.textContent = new Date().getFullYear();
});
