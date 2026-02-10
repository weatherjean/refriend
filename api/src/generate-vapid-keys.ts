/**
 * Generate VAPID keys for Web Push notifications.
 *
 * Run once, then paste the output into your .env file:
 *   deno task generate-vapid
 */

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("Add these to your .env file:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
