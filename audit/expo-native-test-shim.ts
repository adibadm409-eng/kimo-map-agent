export async function openDatabaseAsync() {
  return {
    execAsync: async () => {},
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    getEachAsync: async function* () {},
  }
}
export async function getItemAsync() { return null }
export async function setItemAsync() {}
export async function deleteItemAsync() {}
export const AndroidImportance = { DEFAULT: 3, HIGH: 4 }
export default { openDatabaseAsync, getItemAsync, setItemAsync, deleteItemAsync, AndroidImportance }
