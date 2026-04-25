import { checkBalance } from "../src/wisgate";

try {
	const balance = await checkBalance();
	console.log("WisGate key ACTIVE. Balance:", JSON.stringify(balance, null, 2));
} catch (e) {
	console.error("WisGate key check FAILED:", (e as Error).message);
	process.exit(1);
}
