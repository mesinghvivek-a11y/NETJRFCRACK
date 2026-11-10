import { validateAll } from "./lib.js";

const { issues, papers, taxonomies } = validateAll();
const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");

for (const i of [...errors, ...warns]) console.log(`${i.level === "error" ? "ERROR" : "warn "}  ${i.file}  ${i.msg}`);

const nq = papers.reduce((n, p) => n + (p.data?.questions?.length ?? 0), 0);
console.log(`\n${taxonomies.length} taxonomy file(s), ${papers.length} paper file(s), ${nq} question(s): ${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
