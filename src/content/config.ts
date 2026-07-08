import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    image: z.string().optional(),
    category: z.string(),
    subcategory: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    lang: z.string().default("zh"),
    group: z.string().optional(),
  }),
});

export const collections = { posts };
