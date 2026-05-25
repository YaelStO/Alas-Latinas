import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export function isBiometricSupported() {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  )
}

export async function canUsePlatformBiometric() {
  if (!isBiometricSupported()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerBiometric(api, deviceName = 'Huella / Face ID') {
  const { data } = await api.auth.biometricRegisterOptions()
  const attestation = await startRegistration({ optionsJSON: data.options })
  return api.auth.biometricRegisterVerify({
    ...attestation,
    device_name: deviceName,
  })
}

export async function loginWithBiometric(api, email) {
  const { data } = await api.auth.biometricLoginOptions({ email })
  const assertion = await startAuthentication({ optionsJSON: data.options })
  return api.auth.biometricLoginVerify({ email, ...assertion })
}
