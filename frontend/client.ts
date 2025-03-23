// src/client.ts
import { createThirdwebClient } from "thirdweb";

// Create thirdweb client
export const client = createThirdwebClient({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});
