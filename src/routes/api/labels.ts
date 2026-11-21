import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/labels")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const body = String(form.get("body") ?? "");
        JSON.parse(body);
        return new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="lungad-841.labels.json"',
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
