import { verifyAdminLogin } from "../lib/auth/password.ts";

const [email, password] = process.argv.slice(2);
console.log((await verifyAdminLogin(email, password)) ? "OK" : "FAIL");