import { resetAllData } from "@/lib/db";

async function main() {
  await resetAllData();
  // eslint-disable-next-line no-console
  console.log("Trading dashboard seed complete.");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
