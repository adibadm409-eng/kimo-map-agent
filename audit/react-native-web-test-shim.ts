export const Platform = { OS: 'web', select: <T>(options: Record<string, T>) => options.web ?? options.default }
export default { Platform }
