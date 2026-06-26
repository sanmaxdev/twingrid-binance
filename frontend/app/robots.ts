import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/auth/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://twingridbot.com/sitemap.xml",
  };
}
