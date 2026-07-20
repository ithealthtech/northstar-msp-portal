window.NORTHSTAR_AUTH = {
  clientId: "YOUR_ENTRA_APPLICATION_CLIENT_ID",
  tenantId: "YOUR_ENTRA_TENANT_ID",
  redirectUri: window.location.origin,
  scopes: ["openid", "profile", "email", "User.Read"],
  clientAdminRoles: ["ClientPortal.Admin", "ClientPortal.Owner"],
  mspAdminRoles: ["MSPPortal.Admin", "MSPPortal.Owner"],
  apiScope: "api://YOUR_ENTRA_APPLICATION_CLIENT_ID/Portal.Access",
  demoMode: false
};
