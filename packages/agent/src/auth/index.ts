
export {
  // B-034 — exported so a consumer can `instanceof` it. Same class of defect B-004 fixed for its
  // sibling: a typed error nobody can catch by type is an untyped error with extra steps.
  MissingCredentialError,
  authFilePath,
  credentialHome,
  ensureAuthHome,
  resolveCredential,
  resolveCredentialForModel,
  resolveFreshCredential,
  type ResolvedCredential,
} from './credentials.js'

export { login, logout, methodsFor, oauthDeviceLogin, knownProviders } from './login.js'

export { describeSource, dotenvNames } from './credential-provenance.js'

export { routeToCredential } from './model-route.js'
