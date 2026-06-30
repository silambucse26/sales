import { createFileRoute } from "@tanstack/react-router";
import { seedDemoUsers } from "@/lib/seed-demo.functions";

export const Route = createFileRoute("/api/public/seed-demo")({
  server: {
    handlers: {
      POST: async () => {
        const result = await seedDemoUsers();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
