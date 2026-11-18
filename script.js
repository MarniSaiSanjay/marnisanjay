(() => {
  "use strict";

  const root = document.documentElement;
  document.addEventListener("pointerdown", () => root.classList.add("pointer-input"), { passive: true });
  document.addEventListener("keydown", () => root.classList.remove("pointer-input"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");
  const themeToggle = document.querySelector(".theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const themeParameter = new URLSearchParams(location.search).get("scoutTheme");
  let savedTheme;
  try { savedTheme = localStorage.getItem("theme"); } catch { /* Storage may be disabled. */ }
  if (!["light", "dark"].includes(savedTheme)) savedTheme = null;
  const forcedTheme = ["light", "dark"].includes(themeParameter) ? themeParameter : null;

  function applyTheme(theme) {
    root.dataset.theme = theme;
    themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    themeMeta.content = getComputedStyle(root).getPropertyValue("--cp-bg").trim();
  }
  applyTheme(forcedTheme || savedTheme || (darkPreference.matches ? "dark" : "light"));
  themeToggle.hidden = false;
  themeToggle.addEventListener("click", () => {
    savedTheme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(savedTheme);
    try { localStorage.setItem("theme", savedTheme); } catch { /* The toggle still works without storage. */ }
  });
  darkPreference.addEventListener("change", () => {
    if (!savedTheme && !forcedTheme) applyTheme(darkPreference.matches ? "dark" : "light");
  });

  const menu = document.getElementById("site-menu");
  const menuToggle = document.querySelector(".menu-toggle");
  function closeMenu() { menu.close(); }
  menuToggle.hidden = false;
  root.classList.add("js");
  menuToggle.addEventListener("click", () => {
    menu.showModal();
    menuToggle.setAttribute("aria-expanded", "true");
  });
  menu.querySelector(".menu-close").addEventListener("click", closeMenu);
  menu.addEventListener("close", () => menuToggle.setAttribute("aria-expanded", "false"));
  menu.addEventListener("click", (event) => {
    if (event.target === menu) {
      const bounds = menu.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right) closeMenu();
    }
  });
  menu.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
      const target = document.querySelector(link.hash);
      if (target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    });
  });
  window.matchMedia("(min-width: 768px)").addEventListener("change", () => {
    if (menu.open) closeMenu();
  });

  const header = document.querySelector(".site-header");
  const intro = document.getElementById("intro");
  const introPin = document.querySelector(".hero-pin");
  const work = document.getElementById("projects");
  const workCurve = document.querySelector(".work-curve");
  const openingClip = document.getElementById("opening-scene-clip-path");
  const portrait = document.querySelector(".portrait-frame");
  const projectStack = document.querySelector(".project-stack");
  const projects = [...document.querySelectorAll(".project")];
  const projectArtwork = [...document.querySelectorAll(".project-art")];
  const sectionLinks = [...document.querySelectorAll('.header-links a[href^="#"]')];
  const sections = [...document.querySelectorAll("main > section[id]"), document.getElementById("contact")];
  const stackViewport = window.matchMedia("(min-width: 900px) and (min-height: 800px)");
  const motionToggle = document.querySelector(".motion-toggle");
  const scenes = [...document.querySelectorAll("[data-scene]")].map((element) => {
    const path = element.querySelector(".story-scene defs path");
    const details = [...element.querySelectorAll(".scene-depth > *")];
    details.forEach((detail, index) => {
      detail.setAttribute("pathLength", "1");
      detail.style.setProperty("--detail-start", index / details.length * .16);
    });
    return { element, path, length: path.getTotalLength(), drawEnd: Number(path.dataset.drawEnd) || 1,
      marker: element.querySelector(".scene-marker") };
  });
  let userPaused = false;
  let frame = 0;
  let lastFrameTime = 0;
  let openingProgress;
  let geometry;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function syncMotion() {
    const anchorIndex = geometry ? geometry.sections.reduce((active, section, index) =>
      section.top <= window.scrollY + geometry.viewport * .4 ? index : active, 0) : 0;
    const anchor = anchorIndex > 0 ? sections[anchorIndex] : null;
    const anchorTop = anchor ? geometry.sections[anchorIndex].top - window.scrollY : null;
    const paused = userPaused || reducedMotion.matches;
    root.dataset.motion = paused ? "paused" : "running";
    motionToggle.hidden = reducedMotion.matches;
    motionToggle.querySelector("[data-motion-label]").textContent = paused ? "Resume motion" : "Pause motion";
    motionToggle.querySelector(".motion-symbol").textContent = paused ? "\u25B7" : "\u2161";
    if (geometry) {
      measure();
      if (anchor) {
        window.scrollBy({ top: anchor.getBoundingClientRect().top - anchorTop, behavior: "instant" });
      }
    } else requestTick();
  }
  syncMotion();
  motionToggle.addEventListener("click", () => {
    userPaused = !userPaused;
    syncMotion();
  });

  function measure() {
    const headerHeight = header.offsetHeight;
    root.style.setProperty("--header-height", `${headerHeight}px`);
    const introHold = Math.round(Math.min(window.innerHeight * .35, 280));
    const introTravel = Math.round(Math.min(window.innerHeight * 1.35, 1600));
    const pinIntro = root.dataset.motion === "running" && window.innerHeight >= 540 &&
      introPin.offsetHeight <= window.innerHeight - headerHeight + 1;
    root.style.setProperty("--intro-travel", `${introTravel}px`);
    root.style.setProperty("--intro-hold", `${introHold}px`);
    root.classList.toggle("intro-pinned", pinIntro);
    const stackTop = projectStack.getBoundingClientRect().top;
    const scroll = window.scrollY;
    let projectTop = stackTop + scroll;
    const projectGap = parseFloat(getComputedStyle(projectStack).rowGap) || 0;
    const projectGeometry = projects.map((project) => {
      const position = { top: projectTop, height: project.offsetHeight };
      projectTop += position.height + projectGap;
      return position;
    });
    geometry = {
      introTop: intro.offsetTop - headerHeight,
      headerHeight,
      pinIntro,
      curveHeight: parseFloat(getComputedStyle(workCurve).height),
      workWidth: work.clientWidth,
      introHold: pinIntro ? introHold : 0,
      introTravel: pinIntro ? introTravel : 0,
      portraitTop: portrait.getBoundingClientRect().top + scroll,
      portraitHeight: portrait.offsetHeight,
      pageHeight: Math.max(1, root.scrollHeight - window.innerHeight),
      viewport: window.innerHeight,
      projects: projectGeometry,
      scenes: scenes.map(({ element }) => {
        const section = element.closest("main > section") || element;
        return { top: section.getBoundingClientRect().top + scroll, height: section.offsetHeight };
      }),
      sections: sections.map((section) => ({ id: section.id, top: section.getBoundingClientRect().top + scroll }))
    };
    requestTick();
  }

  function renderScroll(time) {
    frame = 0;
    if (!geometry) return;
    const scroll = window.scrollY;
    const sceneEase = 1 - Math.exp(-Math.min(64, time - lastFrameTime) / 65);
    lastFrameTime = time;
    let scenesMoving = false;
    root.style.setProperty("--page-progress", clamp(scroll / geometry.pageHeight, 0, 1));
    const introProgress = geometry.introTravel ?
      clamp((scroll - geometry.introTop - geometry.introHold) / (geometry.introTravel - geometry.introHold), 0, 1) : 0;
    intro.style.setProperty("--intro-progress", introProgress * introProgress * (3 - 2 * introProgress));
    work.style.setProperty("--work-curve", Math.sin(introProgress * Math.PI));
    if (root.dataset.motion === "running") {
      if (geometry.pinIntro) {
        const opening = geometry.scenes[0];
        const selectedWork = geometry.scenes[1];
        const end = selectedWork.top + selectedWork.height;
        const target = clamp((scroll + geometry.viewport * .8 - opening.top) /
          (end - opening.top + geometry.viewport * .35), 0, 1);
        const inView = scroll + geometry.viewport > opening.top && scroll < end;
        if (inView && openingProgress !== undefined) {
          openingProgress += (target - openingProgress) * sceneEase;
          if (Math.abs(target - openingProgress) > .0001) scenesMoving = true;
          else openingProgress = target;
        } else openingProgress = target;
        root.style.setProperty("--opening-progress", openingProgress);
        root.style.setProperty("--opening-offset", `${scroll - selectedWork.top + geometry.headerHeight}px`);
        const curveHeight = Math.sin(introProgress * Math.PI) * geometry.curveHeight;
        root.style.setProperty("--opening-curve-height", `${curveHeight}px`);
        const clip = `M0 ${curveHeight}Q${geometry.workWidth / 2} ${-curveHeight} ${geometry.workWidth} ${curveHeight}V${selectedWork.height + curveHeight}H0Z`;
        if (openingClip.getAttribute("d") !== clip) openingClip.setAttribute("d", clip);
      }
      scenes.forEach((scene, index) => {
        const item = geometry.scenes[index];
        const target = clamp((scroll + geometry.viewport * .8 - item.top) / (item.height + geometry.viewport * .35), 0, 1);
        const inView = scroll + geometry.viewport > item.top && scroll < item.top + item.height;
        let progress = target;
        if (inView && scene.progress !== undefined) {
          progress = scene.progress + (target - scene.progress) * sceneEase;
          if (Math.abs(target - progress) > .0001) scenesMoving = true;
          else progress = target;
        }
        if (scene.progress !== progress) {
          scene.progress = progress;
          scene.element.style.setProperty("--scene-progress", progress);
          scene.element.style.setProperty("--scene-drift", progress * 2 - 1);
          scene.element.style.setProperty("--scene-focus", .45 + Math.sin(progress * Math.PI) * .55);
        }
        const routeProgress = geometry.pinIntro && index < 2 ? openingProgress : clamp(progress / scene.drawEnd, 0, 1);
        if (scene.element.id === "leadership") {
          const tracing = inView && progress !== target && routeProgress > 0 && routeProgress < 1;
          if (scene.element.classList.contains("is-tracing") !== tracing) {
            scene.element.classList.toggle("is-tracing", tracing);
          }
        }
        if (scene.routeProgress !== routeProgress) {
          scene.routeProgress = routeProgress;
          scene.element.style.setProperty("--route-progress", routeProgress);
          const point = scene.path.getPointAtLength(routeProgress * scene.length);
          scene.marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
        }
      });
      const portraitProgress = clamp((scroll - geometry.portraitTop) / geometry.portraitHeight, -1, 1);
      portrait.style.setProperty("--portrait-y", `${portraitProgress * 12}px`);
      projects.forEach((project, index) => {
        const item = geometry.projects[index];
        const artProgress = clamp((scroll + geometry.viewport - item.top) / (geometry.viewport + item.height), 0, 1);
        project.style.setProperty("--art-y", `${(artProgress - .5) * -40}px`);
        if (stackViewport.matches && index < projects.length - 1) {
          const next = geometry.projects[index + 1];
          const overlap = clamp((scroll + geometry.viewport * .7 - next.top) / (geometry.viewport * .6), 0, 1);
          project.style.scale = 1 - overlap * .035;
        } else {
          project.style.removeProperty("scale");
        }
      });
    } else {
      portrait.style.removeProperty("--portrait-y");
      projects.forEach((project) => {
        project.style.removeProperty("scale");
        project.style.removeProperty("--art-y");
      });
      projectArtwork.forEach((art) => {
        art.style.removeProperty("--tilt-x");
        art.style.removeProperty("--tilt-y");
      });
    }
    let active = "intro";
    geometry.sections.forEach((section) => {
      if (section.top <= scroll + geometry.viewport * .4) active = section.id;
    });
    sectionLinks.forEach((link) => {
      if (link.hash === `#${active}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (scenesMoving) requestTick();
  }
  function requestTick() { if (!frame) frame = requestAnimationFrame(renderScroll); }

  function resumeIntroScroll(event) {
    if (event.defaultPrevented || (event.type === "keydown" &&
        !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))) return;
    if (!intro.classList.contains("is-scroll-resumed") &&
        (intro.matches(":focus-visible") || intro.querySelector(":focus-visible"))) {
      intro.classList.add("is-scroll-resumed");
      requestTick();
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    document.querySelectorAll("[data-reveal]").forEach((element) => {
      element.classList.add("reveal");
      observer.observe(element);
    });
  }
  root.classList.add("motion-ready");
  measure();
  intro.addEventListener("focusout", () => intro.classList.remove("is-scroll-resumed"));
  window.addEventListener("wheel", resumeIntroScroll, { passive: true });
  window.addEventListener("touchmove", resumeIntroScroll, { passive: true });
  window.addEventListener("keydown", resumeIntroScroll);
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("load", measure, { once: true });
  reducedMotion.addEventListener("change", syncMotion);
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  projectArtwork.forEach((art) => {
    let bounds;
    art.addEventListener("pointerenter", () => { bounds = art.getBoundingClientRect(); });
    art.addEventListener("pointermove", (event) => {
      if (!bounds || !finePointer.matches || root.dataset.motion !== "running") return;
      const x = clamp((event.clientX - bounds.left) / bounds.width - .5, -.5, .5);
      const y = clamp((event.clientY - bounds.top) / bounds.height - .5, -.5, .5);
      art.style.setProperty("--tilt-x", `${-y * 14}deg`);
      art.style.setProperty("--tilt-y", `${x * 14}deg`);
    }, { passive: true });
    art.addEventListener("pointerleave", () => {
      art.style.removeProperty("--tilt-x");
      art.style.removeProperty("--tilt-y");
    });
  });

  const year = document.getElementById("year");
  year.textContent = new Date().getFullYear();

  const form = document.getElementById("contact-form");
  const submitButton = document.getElementById("submit-button");
  const submitLabel = submitButton.querySelector("[data-submit-label]");
  const status = document.getElementById("form-status");
  const fields = [...form.querySelectorAll("input, textarea")];
  let sending = false;

  function validateField(field) {
    const error = document.getElementById(`${field.id}-error`);
    let message = "";
    if (!field.value.trim()) message = `Please enter your ${field.id}.`;
    else if (field.type === "email" && field.validity.typeMismatch) message = "Enter a valid email address, like name@example.com.";
    else if (field.value.length > field.maxLength) message = `Keep this under ${field.maxLength} characters.`;
    field.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message;
    return !message;
  }
  fields.forEach((field) => {
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") validateField(field);
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const validity = fields.map(validateField);
    if (validity.includes(false)) {
      status.dataset.state = "error";
      status.textContent = "Check the highlighted fields, then send again.";
      fields[validity.indexOf(false)].focus();
      measure();
      return;
    }
    sending = true;
    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    submitLabel.textContent = "Sending\u2026";
    status.dataset.state = "pending";
    status.textContent = "Sending your message\u2026";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          service_id: "service_marsas",
          template_id: "template_marsas",
          user_id: "nrWFut7QzlcvIvCLZ",
          template_params: {
            from_name: form.elements.name.value.trim(),
            email: form.elements.email.value.trim(),
            message: form.elements.message.value.trim()
          }
        })
      });
      if (!response.ok) throw new Error("Message delivery failed");
      form.reset();
      fields.forEach((field) => field.removeAttribute("aria-invalid"));
      status.dataset.state = "success";
      status.textContent = "Message sent. Thanks for getting in touch!";
    } catch {
      status.dataset.state = "error";
      status.textContent = "Your message wasn't sent. Try again, or email marnisaisanjay@gmail.com directly. Your draft is still here.";
    } finally {
      clearTimeout(timeout);
      sending = false;
      submitButton.disabled = false;
      form.removeAttribute("aria-busy");
      submitLabel.textContent = "Send message";
      measure();
    }
  });
  form.noValidate = true;
})();
