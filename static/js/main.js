/* ============================================================
   Global behaviours shared across every page.
   ============================================================ */
(function () {
  "use strict";

  /* ---- Navbar: solid on scroll ---- */
  const nav = document.getElementById("nav");
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  const burger = document.getElementById("burger");
  const links = document.getElementById("navlinks");
  const closeMenu = () => {
    links.classList.remove("open");
    burger.classList.remove("open");
    document.body.classList.remove("nav-open");
    document.body.style.overflow = "";
    burger.setAttribute("aria-expanded", "false");
  };
  if (burger && links) {
    let lastToggleMs = 0;
    const toggleMenu = (ev) => {
      if (ev) ev.preventDefault();
      const now = Date.now();
      if (now - lastToggleMs < 250) return;
      lastToggleMs = now;
      const open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      document.body.classList.toggle("nav-open", open);
      document.body.style.overflow = open ? "hidden" : "";
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    };
    burger.addEventListener("pointerup", toggleMenu);
    burger.addEventListener("click", toggleMenu);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && links.classList.contains("open")) {
        closeMenu();
      }
    });
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        closeMenu();
      })
    );
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080 && links.classList.contains("open")) closeMenu();
    });
  }

  /* ---- Active nav link ---- */
  const path = window.location.pathname;
  document.querySelectorAll(".nav__links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path || (href !== "/" && path.startsWith(href))) {
      a.classList.add("active");
    } else if (href === "/" && path === "/") {
      a.classList.add("active");
    }
  });

  /* ---- Scroll reveal via IntersectionObserver ---- */
  const revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }
})();

/* ---- Shared helpers (global) ---- */
const CARNIVAL = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Request failed: " + url);
    return r.json();
  },
  // Animate a number from 0 -> target
  countUp(el, target, dur = 1100) {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    };
    requestAnimationFrame(step);
  },
  statusBadge(status) {
    const s = (status || "upcoming").toLowerCase();
    if (s === "live") return '<span class="badge badge--live">Live</span>';
    if (s === "completed") return '<span class="badge badge--done">Completed</span>';
    return '<span class="badge badge--gold">Upcoming</span>';
  },
  tagClass(tag) {
    if (tag === "Urgent") return "ann--urgent";
    if (tag === "Result") return "ann--result";
    return "ann--info";
  },
  esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  },
};
