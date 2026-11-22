const API = "/.netlify/functions/staff";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const state = {
  status: null,
  person: null,
  tab: "report",
  mode: "pin",
  message: "",
  messageOk: false,
  busy: false,
  reportDate: "",
  shiftDate: "",
  report: null,
  roster: null,
  today: null,
  editing: null,
};

function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (typeof value === "function" && key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  const add = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(add);
      return;
    }
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  };
  children.forEach(add);
  return node;
}

async function api(action, payload = {}, method = "POST") {
  const url = method === "GET"
    ? `${API}?${new URLSearchParams({ action, ...payload })}`
    : API;
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error("The staff page could not reach the kitchen network. Try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That did not save.");
  return data;
}

function setMessage(error, ok = false) {
  state.message = error ? error.message || String(error) : "";
  state.messageOk = ok;
}

function shell(main, { tabs = false } = {}) {
  const signedIn = Boolean(state.person);
  return h("div", { class: "staff-app" }, [
    h("header", { class: "topbar" }, [
      h("a", { class: "brand-mark", href: "/" }, "urban."),
      h("div", { class: "topbar-side" }, [
        h("p", { class: "kicker" }, "Staff"),
        signedIn ? h("button", { class: "text-button", type: "button", onClick: signOut }, "Sign out") : null,
      ]),
    ]),
    h("main", { class: "staff-main" }, [
      state.message ? h("p", { class: state.messageOk ? "banner is-ok" : "banner", role: "status" }, state.message) : null,
      main,
    ]),
    tabs ? tabbar() : null,
  ]);
}

function tabbar() {
  const tabs = [
    ["report", "Report"],
    ["shift", "Shift"],
    ["team", "Team"],
    ["lists", "Lists"],
  ];
  return h("nav", { class: "tabbar", "aria-label": "Manager" }, tabs.map(([id, label]) => h("button", {
    type: "button",
    "data-tab": id,
    "aria-selected": state.tab === id ? "true" : "false",
    onClick: () => openTab(id),
  }, label)));
}

function render(node) {
  node.id = "app";
  const current = document.querySelector("#app");
  if (current) current.replaceWith(node);
  else document.body.append(node);
}

function field(label, control) {
  return h("label", { class: "field" }, label, control);
}

function pinForm({ title, lede, submitLabel, onSubmit, allowPassword = false }) {
  const input = h("input", {
    class: "pin-input",
    type: "password",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: "6",
    name: "pin",
    "aria-label": "PIN",
  });
  const dots = h("p", { class: "pin-dots", "aria-hidden": "true" }, "○○○○");
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    const filled = input.value.length;
    dots.textContent = "●".repeat(filled) + "○".repeat(Math.max(0, 4 - filled));
  });
  const press = (digit) => {
    if (digit === "back") input.value = input.value.slice(0, -1);
    else if (input.value.length < 6) input.value += digit;
    input.dispatchEvent(new Event("input"));
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "spacer", "0", "back"];
  return h("form", { class: "panel", onSubmit }, [
    h("p", { class: "date-line" }, state.status?.dateLabel || "Urban Kitchen"),
    h("h1", {}, title),
    h("p", { class: "lede" }, lede),
    field("PIN", input),
    dots,
    h("div", { class: "pad" }, keys.map((key) => (key === "spacer" ? h("span", {}) : h("button", {
      type: "button",
      "data-digit": key,
      onClick: () => press(key),
    }, key === "back" ? "⌫" : key)))),
    h("button", { class: "button", type: "submit", "data-action": "sign-in" }, submitLabel),
    allowPassword ? h("button", {
      class: "text-button",
      type: "button",
      onClick: () => {
        state.mode = "password";
        state.message = "";
        draw();
      },
    }, "Use a manager password") : null,
  ]);
}

function draw() {
  if (!state.status) {
    render(shell(h("p", { class: "staff-loading" }, "Loading side work…")));
    return;
  }
  if (state.status.needsBootstrap) {
    render(shell(bootstrapView()));
    return;
  }
  if (!state.person) {
    render(shell(state.mode === "password" ? passwordView() : loginView()));
    return;
  }
  if (state.person.kind === "employee" || state.tab === "mine") {
    render(shell(checklistView(), { tabs: state.person.kind === "manager" }));
    return;
  }
  const views = { report: reportView, shift: shiftView, team: teamView, lists: listsView };
  render(shell((views[state.tab] || reportView)(), { tabs: true }));
}

function bootstrapView() {
  if (!state.status.setupConfigured) {
    return h("section", {}, [
      h("h1", {}, "Setup is not ready"),
      h("p", { class: "lede" }, "Add the UK_STAFF_SETUP_SECRET environment variable in Netlify, redeploy, then reload this page to create the first manager."),
    ]);
  }
  return h("form", {
    class: "panel",
    onSubmit: async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        const result = await api("bootstrap", {
          setupSecret: data.get("setupSecret"),
          name: data.get("name"),
          pin: data.get("pin") || undefined,
          password: data.get("password") || undefined,
        });
        state.person = result.person;
        state.status.needsBootstrap = false;
        state.message = "";
        await openManager();
      } catch (error) {
        setMessage(error);
        draw();
      }
    },
  }, [
    h("p", { class: "kicker" }, "First manager"),
    h("h1", {}, "Create the manager login"),
    h("p", { class: "lede" }, "Enter the one-time setup secret from Netlify, then choose the PIN or password this manager will use."),
    field("Setup secret", h("input", { type: "password", name: "setupSecret", autocomplete: "off", required: true })),
    field("Name", h("input", { type: "text", name: "name", autocomplete: "name", required: true })),
    field("PIN", h("input", { class: "pin-input", type: "password", name: "pin", inputmode: "numeric", maxlength: "6", autocomplete: "off" })),
    field("Or a password", h("input", { type: "password", name: "password", autocomplete: "new-password", minlength: "8" })),
    h("button", { class: "button", type: "submit" }, "Create manager"),
  ]);
}

function loginView() {
  return pinForm({
    title: "Side work",
    lede: "Enter the same PIN you use on Genius.",
    submitLabel: "Sign in",
    allowPassword: true,
    onSubmit: async (event) => {
      event.preventDefault();
      const pin = new FormData(event.target).get("pin");
      try {
        const result = await api("login", { pin });
        await enter(result.person);
      } catch (error) {
        setMessage(error);
        draw();
      }
    },
  });
}

function passwordView() {
  return h("form", {
    class: "panel",
    onSubmit: async (event) => {
      event.preventDefault();
      try {
        const result = await api("login", { password: new FormData(event.target).get("password") });
        await enter(result.person);
      } catch (error) {
        setMessage(error);
        draw();
      }
    },
  }, [
    h("p", { class: "date-line" }, state.status.dateLabel || ""),
    h("h1", {}, "Manager sign in"),
    h("p", { class: "lede" }, "Use the manager password set during setup."),
    field("Password", h("input", { type: "password", name: "password", autocomplete: "current-password", required: true, minlength: "8" })),
    h("button", { class: "button", type: "submit", "data-action": "sign-in" }, "Sign in"),
    h("button", {
      class: "text-button",
      type: "button",
      onClick: () => {
        state.mode = "pin";
        state.message = "";
        draw();
      },
    }, "Use a PIN"),
  ]);
}

async function enter(person) {
  state.person = person;
  state.message = "";
  state.mode = "pin";
  if (person.kind === "manager") await openManager();
  else await openChecklist();
}

async function openChecklist() {
  state.today = await api("today", {}, "GET");
  state.tab = state.person.kind === "manager" ? "mine" : "report";
  draw();
}

async function openManager() {
  state.roster = await api("roster", {}, "GET");
  state.reportDate = state.reportDate || state.roster.date;
  state.shiftDate = state.shiftDate || state.roster.date;
  state.report = await api("report", { date: state.reportDate }, "GET");
  state.tab = "report";
  draw();
}

async function openTab(id) {
  state.tab = id;
  state.message = "";
  try {
    if (id === "report") state.report = await api("report", { date: state.reportDate || state.roster.date }, "GET");
    if (id === "team" || id === "lists" || id === "shift") state.roster = await api("roster", {}, "GET");
    if (id === "shift") state.report = await api("report", { date: state.shiftDate || state.roster.date }, "GET");
  } catch (error) {
    setMessage(error);
  }
  draw();
}

async function signOut() {
  try { await api("logout"); } catch { /* The cookie is cleared when the server accepts it. */ }
  state.person = null;
  state.today = null;
  state.report = null;
  state.tab = "report";
  state.message = "";
  draw();
}

function checklistView() {
  const today = state.today;
  if (!today) return h("p", {}, "Loading today's list…");
  const mineNote = state.person.kind === "manager"
    ? h("button", { class: "text-button", type: "button", onClick: () => openTab("report") }, "Back to the report")
    : null;
  if (!today.checklist) {
    return h("section", {}, [
      h("p", { class: "date-line" }, today.dateLabel),
      h("h1", {}, `Hello, ${today.employee.name}`),
      h("p", { class: "lede" }, today.openRoles.length ? "Which role are you on today?" : "Every role is taken. Ask a manager to assign you."),
      mineNote,
      ...today.openRoles.map((role) => h("button", {
        class: "choice",
        type: "button",
        onClick: () => chooseRole(role.id),
      }, [
        h("span", {}, [
          role.name,
          role.subtitle ? h("span", { class: "task-meta" }, role.subtitle) : null,
          role.offSchedule ? h("span", { class: "missed-flag" }, role.scheduleLabel ? `Usually ${role.scheduleLabel}` : "Outside the usual days") : null,
        ]),
      ])),
    ]);
  }
  const list = today.checklist;
  const pct = list.total ? Math.round((list.completed / list.total) * 100) : 0;
  return h("section", {}, [
    h("p", { class: "date-line" }, today.dateLabel),
    h("h1", {}, list.name),
    h("p", { class: "lede" }, [list.subtitle, list.source === "self" ? "You chose this shift." : "A manager assigned this shift."].filter(Boolean).join(" · ")),
    mineNote,
    h("div", { class: "progress" }, [
      h("span", {}, `${list.completed} of ${list.total} done`),
      h("span", {}, today.employee.name),
    ]),
    h("div", { class: "meter", "aria-hidden": "true" }, h("span", { style: `width:${pct}%` })),
    ...list.sections.map((section) => h("div", {}, [
      h("h2", { class: "section-title" }, section.title),
      ...section.tasks.map((task) => taskButton(task)),
    ])),
  ]);
}

function taskButton(task) {
  return h("button", {
    class: task.done ? "task is-done" : "task",
    type: "button",
    "aria-pressed": task.done ? "true" : "false",
    disabled: state.busy,
    onClick: () => toggle(task),
  }, [
    h("span", { class: "box", "aria-hidden": "true" }),
    h("span", { class: "task-copy" }, [
      h("span", { class: "task-text" }, task.text),
      task.done ? h("span", { class: "task-meta" }, `${task.employeeName} · ${task.atLabel}`) : null,
    ]),
  ]);
}

async function chooseRole(roleId) {
  state.busy = true;
  try {
    state.today = await api("pick-role", { roleId });
    state.message = "";
  } catch (error) {
    setMessage(error);
  } finally {
    state.busy = false;
    draw();
  }
}

async function toggle(task) {
  state.busy = true;
  draw();
  try {
    state.today = await api("toggle-task", { taskId: task.id, checked: !task.done });
    state.message = "";
  } catch (error) {
    setMessage(error);
  } finally {
    state.busy = false;
    draw();
  }
}

function reportView() {
  const report = state.report;
  if (!report) return h("p", {}, "Loading the report…");
  return h("section", {}, [
    h("p", { class: "date-line" }, "Daily report"),
    h("h1", {}, report.dateLabel),
    field("Day", h("input", {
      type: "date",
      value: report.date,
      onChange: async (event) => {
        state.reportDate = event.target.value;
        try {
          state.report = await api("report", { date: state.reportDate }, "GET");
          state.message = "";
        } catch (error) {
          setMessage(error);
        }
        draw();
      },
    })),
    h("div", { class: "summary" }, [
      h("strong", {}, report.missed ? `${report.missed} still open` : "All caught up"),
      h("span", {}, `${report.completed} of ${report.total} checked off`),
    ]),
    h("a", {
      class: "button button-secondary",
      href: `${API}?action=report-csv&date=${encodeURIComponent(report.date)}`,
    }, "Download CSV"),
    ...report.roles.flatMap((role) => roleBlock(role, { interactive: false })),
    state.person.kind === "manager" ? h("button", {
      class: "button",
      type: "button",
      onClick: async () => {
        try {
          state.today = await api("today", {}, "GET");
          state.tab = "mine";
          state.message = "";
        } catch (error) {
          setMessage(error);
        }
        draw();
      },
    }, "My side work") : null,
  ]);
}

function roleBlock(role, { interactive }) {
  const who = role.assignee
    ? `${role.assignee.employeeName} · ${role.assignee.source === "self" ? "chose this shift" : "assigned"}`
    : "Nobody assigned";
  return [
    h("div", { class: "role-head" }, [
      h("div", {}, [
        h("h2", {}, role.subtitle ? `${role.name}` : role.name),
        h("p", {}, role.subtitle || ""),
        h("p", { class: "assignee" }, who),
      ]),
      h("span", { class: role.missed ? "pill is-off" : "pill" }, `${role.completed}/${role.total}`),
    ]),
    ...role.sections.flatMap((section) => [
      h("h3", { class: "section-title" }, section.title),
      ...section.tasks.map((task) => {
        if (interactive) return taskButton(task);
        return h("div", { class: task.done ? "task is-done" : "task is-missed" }, [
          h("span", { class: "box", "aria-hidden": "true" }),
          h("span", { class: "task-copy" }, [
            h("span", { class: "task-text" }, task.text),
            task.done
              ? h("span", { class: "task-meta" }, `${task.employeeName} · ${task.atLabel}`)
              : h("span", { class: "missed-flag" }, "Missed"),
          ]),
        ]);
      }),
    ]),
  ];
}

function shiftView() {
  const report = state.report;
  const roster = state.roster;
  if (!report || !roster) return h("p", {}, "Loading the shift…");
  const people = [...roster.employees, ...roster.managers].filter((person) => person.active);
  return h("section", {}, [
    h("p", { class: "date-line" }, "Who is on"),
    h("h1", {}, "Shift"),
    field("Day", h("input", {
      type: "date",
      value: state.shiftDate,
      onChange: async (event) => {
        state.shiftDate = event.target.value;
        try {
          state.report = await api("report", { date: state.shiftDate }, "GET");
          state.message = "";
        } catch (error) {
          setMessage(error);
        }
        draw();
      },
    })),
    h("p", { class: "hint" }, "Assign a role, or leave it open and the person can claim it on their phone."),
    ...report.roles.filter((role) => role.active || role.assignee).map((role) => h("label", { class: "field" }, [
      `${role.name}${role.subtitle ? ` · ${role.subtitle}` : ""}`,
      h("select", {
        onChange: (event) => saveAssignment(role.id, event.target.value),
      }, [
        h("option", { value: "", selected: !role.assignee }, "Unassigned"),
        ...people.map((person) => h("option", {
          value: person.id,
          selected: role.assignee?.employeeId === person.id,
        }, person.name)),
      ]),
      role.assignee?.source === "self" ? h("span", { class: "hint" }, `${role.assignee.employeeName} chose this shift.`) : null,
    ])),
  ]);
}

async function saveAssignment(roleId, employeeId) {
  try {
    state.report = await api("assign", { date: state.shiftDate, roleId, employeeId: employeeId || null });
    state.message = "Shift saved.";
    state.messageOk = true;
  } catch (error) {
    setMessage(error);
  }
  draw();
}

function teamView() {
  const roster = state.roster;
  if (!roster) return h("p", {}, "Loading the team…");
  return h("section", {}, [
    h("p", { class: "date-line" }, "People"),
    h("h1", {}, "Team"),
    h("p", { class: "hint" }, "PINs should match Genius. They are stored scrambled, and this page never shows them again."),
    personForm("Add an employee", "save-employee", false),
    ...roster.employees.map((person) => personCard(person, "save-employee")),
    h("h2", { class: "section-title" }, "Managers"),
    personForm("Add a manager", "save-manager", true),
    ...roster.managers.map((person) => personCard(person, "save-manager")),
  ]);
}

function personForm(title, action, manager) {
  return h("form", {
    class: "panel person",
    onSubmit: async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      if (!manager && data.get("pin") !== data.get("confirm")) {
        setMessage(new Error("Those PINs do not match."));
        draw();
        return;
      }
      try {
        const result = await api(action, {
          name: data.get("name"),
          pin: data.get("pin") || undefined,
          password: data.get("password") || undefined,
        });
        state.roster.employees = result.employees;
        state.roster.managers = result.managers;
        state.message = `${data.get("name")} was added.`;
        state.messageOk = true;
      } catch (error) {
        setMessage(error);
      }
      draw();
    },
  }, [
    h("h2", {}, title),
    field("Name", h("input", { type: "text", name: "name", required: true, autocomplete: "off" })),
    field("PIN", h("input", { type: "password", name: "pin", inputmode: "numeric", maxlength: "6", autocomplete: "new-password", required: !manager })),
    manager ? null : field("Confirm PIN", h("input", { type: "password", name: "confirm", inputmode: "numeric", maxlength: "6", autocomplete: "new-password" })),
    manager ? field("Password, if not using a PIN", h("input", { type: "password", name: "password", autocomplete: "new-password", minlength: "8" })) : null,
    h("button", { class: "button", type: "submit" }, title),
  ]);
}

function personCard(person, action) {
  if (state.editing !== person.id) {
    return h("article", { class: "person" }, [
      h("div", { class: "person-row" }, [
        h("h2", {}, person.name),
        h("span", { class: person.active ? "pill" : "pill is-off" }, person.active ? "Active" : "Inactive"),
      ]),
      h("button", {
        class: "button button-secondary",
        type: "button",
        onClick: () => {
          state.editing = person.id;
          state.message = "";
          draw();
        },
      }, "Edit"),
    ]);
  }
  return h("form", {
    class: "person",
    onSubmit: async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        const result = await api(action, {
          id: person.id,
          name: data.get("name"),
          pin: data.get("pin") || undefined,
          password: data.get("password") || undefined,
          active: data.get("active") === "on",
        });
        state.roster.employees = result.employees;
        state.roster.managers = result.managers;
        if (result.person) state.person = result.person;
        state.editing = null;
        state.message = "Saved.";
        state.messageOk = true;
      } catch (error) {
        setMessage(error);
      }
      draw();
    },
  }, [
    h("div", { class: "person-row" }, [
      h("h2", {}, person.name),
      h("span", { class: person.active ? "pill" : "pill is-off" }, person.active ? "Active" : "Inactive"),
    ]),
    field("Name", h("input", { type: "text", name: "name", value: person.name, required: true })),
    field("New PIN", h("input", { type: "password", name: "pin", inputmode: "numeric", maxlength: "6", autocomplete: "new-password", placeholder: "Leave blank to keep" })),
    action === "save-manager" ? field("New password", h("input", { type: "password", name: "password", autocomplete: "new-password", placeholder: "Leave blank to keep" })) : null,
    h("label", { class: "hint" }, [
      h("input", { type: "checkbox", name: "active", checked: person.active ? true : null }),
      " Active",
    ]),
    h("div", { class: "split" }, [
      h("button", { class: "button", type: "submit" }, "Save"),
      h("button", {
        class: "button button-secondary",
        type: "button",
        onClick: () => {
          state.editing = null;
          state.message = "";
          draw();
        },
      }, "Cancel"),
    ]),
  ]);
}

function listsView() {
  const roster = state.roster;
  if (!roster) return h("p", {}, "Loading lists…");
  return h("section", {}, [
    h("p", { class: "date-line" }, "Side work"),
    h("h1", {}, "Lists"),
    h("p", { class: "hint" }, "Edit a list here when the floor changes. Kitchen and opening lists can be added without a code change."),
    h("form", {
      class: "panel person",
      onSubmit: async (event) => {
        event.preventDefault();
        const data = new FormData(event.target);
        try {
          const result = await api("save-role", {
            name: data.get("name"),
            subtitle: data.get("subtitle"),
            scheduleLabel: data.get("scheduleLabel"),
            sections: [{ title: data.get("section") || "Side work", tasks: [{ text: data.get("task") }] }],
          });
          state.roster.roles = result.roles;
          state.message = "Role added.";
          state.messageOk = true;
        } catch (error) {
          setMessage(error);
        }
        draw();
      },
    }, [
      h("h2", {}, "Add a role"),
      field("Role", h("input", { name: "name", type: "text", required: true, placeholder: "Line cook" })),
      field("Subtitle", h("input", { name: "subtitle", type: "text", placeholder: "Opening" })),
      field("Usual days", h("input", { name: "scheduleLabel", type: "text", placeholder: "Every day" })),
      field("First section", h("input", { name: "section", type: "text", value: "Side work" })),
      field("First task", h("input", { name: "task", type: "text", required: true })),
      h("button", { class: "button", type: "submit" }, "Add role"),
    ]),
    ...roster.roles.map((role) => roleEditor(role)),
  ]);
}

function readRoleForm(form, draft) {
  if (!form) return;
  draft.name = form.elements.name.value;
  draft.subtitle = form.elements.subtitle.value;
  draft.scheduleLabel = form.elements.schedule.value;
  draft.active = form.elements.active.checked;
  draft.sections.forEach((section, sectionIndex) => {
    const title = form.elements[`section-${sectionIndex}`];
    if (title) section.title = title.value;
    section.tasks.forEach((task, taskIndex) => {
      const input = form.elements[`task-${sectionIndex}-${taskIndex}`];
      if (input) task.text = input.value;
    });
  });
}

function roleEditor(role) {
  const draft = JSON.parse(JSON.stringify(role));
  return h("form", {
    class: "role-card stack",
      onSubmit: async (event) => {
      event.preventDefault();
      readRoleForm(event.target, draft);
      try {
        const result = await api("save-role", { role: draft });
        state.roster.roles = result.roles;
        state.message = `${draft.name} saved.`;
        state.messageOk = true;
      } catch (error) {
        setMessage(error);
      }
      draw();
    },
  }, [
    h("h2", {}, role.name),
    field("Role", h("input", { name: "name", type: "text", value: role.name, required: true })),
    field("Subtitle", h("input", { name: "subtitle", type: "text", value: role.subtitle || "" })),
    field("Usual days", h("input", { name: "schedule", type: "text", value: role.scheduleLabel || "" })),
    h("div", { class: "days" }, DAY_NAMES.map((label, index) => h("button", {
      type: "button",
      "aria-pressed": draft.days.includes(index) ? "true" : "false",
      "aria-label": label,
      onClick: (event) => {
        draft.days = draft.days.includes(index) ? draft.days.filter((day) => day !== index) : [...draft.days, index].sort();
        event.currentTarget.setAttribute("aria-pressed", draft.days.includes(index) ? "true" : "false");
      },
    }, label))),
    h("label", { class: "hint" }, [
      h("input", { name: "active", type: "checkbox", checked: role.active ? true : null }),
      " Role is in use",
    ]),
    ...draft.sections.map((section, sectionIndex) => h("div", { class: "stack" }, [
      field("Section", h("input", { name: `section-${sectionIndex}`, type: "text", value: section.title })),
      ...section.tasks.map((task, taskIndex) => field("Task", h("input", {
        name: `task-${sectionIndex}-${taskIndex}`,
        type: "text",
        value: task.text,
      }))),
      h("button", {
        class: "button button-secondary",
        type: "button",
        onClick: (event) => {
          readRoleForm(event.currentTarget.form, draft);
          section.tasks.push({ text: "" });
          state.roster.roles = state.roster.roles.map((item) => item.id === role.id ? draft : item);
          draw();
        },
      }, "Add task"),
    ])),
    h("button", {
      class: "button button-secondary",
      type: "button",
      onClick: (event) => {
        readRoleForm(event.currentTarget.form, draft);
        draft.sections.push({ title: "New section", tasks: [{ text: "" }] });
        state.roster.roles = state.roster.roles.map((item) => item.id === role.id ? draft : item);
        draw();
      },
    }, "Add section"),
    h("div", { class: "split" }, [
      h("button", { class: "button", type: "submit" }, "Save list"),
      h("button", {
        class: "button button-quiet",
        type: "button",
        onClick: async (event) => {
          readRoleForm(event.currentTarget.form, draft);
          const total = draft.sections.reduce((sum, section) => sum + section.tasks.length, 0);
          if (total < 2) {
            setMessage(new Error("Leave at least one task on the list."));
            draw();
            return;
          }
          const section = draft.sections[draft.sections.length - 1];
          section.tasks.pop();
          if (!section.tasks.length && draft.sections.length > 1) draft.sections.pop();
          state.message = "";
          state.roster.roles = state.roster.roles.map((item) => item.id === role.id ? draft : item);
          draw();
        },
      }, "Remove last task"),
    ]),
  ]);
}

async function start() {
  try {
    state.status = await api("status", {}, "GET");
    if (!state.status.needsBootstrap) {
      try {
        const session = await api("session", {}, "GET");
        state.person = session.person;
        state.reportDate = session.date;
        state.shiftDate = session.date;
        if (session.person.kind === "manager") {
          state.roster = await api("roster", {}, "GET");
          state.report = await api("report", { date: session.date }, "GET");
        } else {
          state.today = await api("today", {}, "GET");
        }
      } catch {
        state.person = null;
      }
    }
  } catch (error) {
    state.status = { needsBootstrap: false, setupConfigured: false, dateLabel: "" };
    setMessage(error);
  }
  draw();
}

start();
