export function requireUser(req) {
  if (!req.user?.id) throw Object.assign(new Error('请先登录'), { status: 401, code: 'UNAUTHENTICATED' });
  return req.user;
}

export function requireAdminToken(req, envName, header = 'x-admin-token') {
  const configured = process.env[envName];
  if (!configured) throw Object.assign(new Error(`${envName} is not configured`), { status: 503, code: 'ADMIN_TOKEN_NOT_CONFIGURED' });
  if (req.get(header) !== configured) throw Object.assign(new Error('Invalid administrator token'), { status: 401, code: 'INVALID_ADMIN_TOKEN' });
}
