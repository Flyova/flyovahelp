export const SUPPORT_ADMIN_EMAIL = "flyovasocials@gmail.com";
export const STAFF_ADMIN_EMAIL = "flyovahelpsocials@gmail.com";

const PRIVILEGED_ROLES = new Set(["admin", "staff", "support"]);

const ROUTE_RULES = {
  admin: {
    exact: ["/admin"],
    prefixes: ["/admin/"],
  },
  support: {
    exact: ["/admin", "/admin/agent-tx", "/admin/support"],
    prefixes: [],
  },
  staff: {
    exact: ["/admin", "/admin/agent-tx", "/admin/broadcast", "/admin/testimonials", "/admin/blog", "/admin/blog/new"],
    prefixes: ["/admin/blog/"],
  },
};

const normalize = (value) => String(value || "").trim().toLowerCase();

export function resolvePrivilegedRole(role, email) {
  const normalizedRole = normalize(role);
  if (PRIVILEGED_ROLES.has(normalizedRole)) return normalizedRole;

  const normalizedEmail = normalize(email);
  if (normalizedEmail === SUPPORT_ADMIN_EMAIL) return "support";
  if (normalizedEmail === STAFF_ADMIN_EMAIL) return "staff";
  return null;
}

export function canAccessAdminPath(role, pathname) {
  const rules = ROUTE_RULES[role];
  if (!rules) return false;
  if (rules.exact.includes(pathname)) return true;
  return rules.prefixes.some((prefix) => pathname.startsWith(prefix));
}

