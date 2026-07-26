sed -i 's/const cleanO1 = (o1.domain || .*\.replace/const cleanO1 = ((typeof o1 === "string" ? o1 : o1.domain) || "").replace/g' src/app/modules/admin/content/ai-writer/ai-writer.component.ts
sed -i 's/const cleanO2 = (o2.domain || .*\.replace/const cleanO2 = ((typeof o2 === "string" ? o2 : o2.domain) || "").replace/g' src/app/modules/admin/content/ai-writer/ai-writer.component.ts
sed -i 's/const cleanD1 = (d1.domain || .*\.replace/const cleanD1 = ((typeof d1 === "string" ? d1 : d1.domain) || "").replace/g' src/app/modules/admin/content/sitemap/sitemap.component.ts
sed -i 's/const cleanD2 = (d2.domain || .*\.replace/const cleanD2 = ((typeof d2 === "string" ? d2 : d2.domain) || "").replace/g' src/app/modules/admin/content/sitemap/sitemap.component.ts
