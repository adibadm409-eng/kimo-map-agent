export async function getInfoAsync() {
  return { exists: false, size: 0 }
}

export async function readAsStringAsync() {
  return ''
}

export async function deleteAsync() {}
export async function copyAsync() {}
export async function makeDirectoryAsync() {}
export const documentDirectory = 'file:///test/'
export const cacheDirectory = 'file:///cache/'
export const EncodingType = { Base64: 'base64', UTF8: 'utf8' }
export default { getInfoAsync, readAsStringAsync, deleteAsync, copyAsync, makeDirectoryAsync, documentDirectory, cacheDirectory, EncodingType }
