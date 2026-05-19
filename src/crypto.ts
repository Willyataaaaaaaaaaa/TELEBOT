import CryptoJS from 'crypto-js';

// In a real application, you should use environment variables for keys.
// For this app, we'll use a hardcoded key to ensure server and client match perfectly in preview.
const SECRET_KEY = 'TELEGRAM-BOT-SECRET-ENCRYPTION-KEY-2026';

export const encryptPayload = (data: any): string => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

export const decryptPayload = (ciphertext: string): any => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedString) return null;
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
};
