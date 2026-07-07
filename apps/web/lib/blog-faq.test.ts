import { describe, expect, test } from "bun:test";
import { parseFaqSection } from "./blog-faq";

describe("parseFaqSection", () => {
  test("en FAQ section", () => {
    const md = `# Article Title

Some intro paragraph.

## Frequently Asked Questions

### What is Sepio?

Sepio is a content automation platform for busy teams.

### How much does it cost?

Pricing starts at $29/month, see our pricing page for details.
`;
    expect(parseFaqSection(md)).toEqual([
      {
        question: "What is Sepio?",
        answer: "Sepio is a content automation platform for busy teams.",
      },
      {
        question: "How much does it cost?",
        answer:
          "Pricing starts at $29/month, see our pricing page for details.",
      },
    ]);
  });

  test("es FAQ section (Preguntas frecuentes)", () => {
    const md = `## Preguntas frecuentes

### ¿Qué es Sepio?

Es una plataforma de automatización de contenido.

### ¿Cuánto cuesta?

Desde $29 al mes.
`;
    expect(parseFaqSection(md)).toEqual([
      {
        question: "¿Qué es Sepio?",
        answer: "Es una plataforma de automatización de contenido.",
      },
      { question: "¿Cuánto cuesta?", answer: "Desde $29 al mes." },
    ]);
  });

  test("ru FAQ section (Часто задаваемые вопросы)", () => {
    const md = `## Часто задаваемые вопросы

### Что такое Sepio?

Sepio — платформа автоматизации контента.

### Сколько это стоит?

От $29 в месяц.
`;
    expect(parseFaqSection(md)).toEqual([
      {
        question: "Что такое Sepio?",
        answer: "Sepio — платформа автоматизации контента.",
      },
      { question: "Сколько это стоит?", answer: "От $29 в месяц." },
    ]);
  });

  test("no FAQ section → []", () => {
    const md = `# Article Title

Just a regular article with no FAQ heading at all.

## Conclusion

Thanks for reading.
`;
    expect(parseFaqSection(md)).toEqual([]);
  });

  test("single Q&A pair is treated as noise → []", () => {
    const md = `## FAQ

### Only question?

Only answer.
`;
    expect(parseFaqSection(md)).toEqual([]);
  });

  test("strips markdown formatting from answers", () => {
    const md = `## FAQ

### Question one?

This has **bold**, *italic*, \`code\`, a [link](https://example.com/x), and an image ![alt text](https://example.com/img.png) inline.

### Question two?

Second answer with multiple
lines that should
collapse into one line.
`;
    expect(parseFaqSection(md)).toEqual([
      {
        question: "Question one?",
        answer:
          "This has bold, italic, code, a link, and an image inline.",
      },
      {
        question: "Question two?",
        answer:
          "Second answer with multiple lines that should collapse into one line.",
      },
    ]);
  });

  test("FAQ section not last — stops at the next H2", () => {
    const md = `## FAQ

### Q1?

A1.

### Q2?

A2.

## Related Links

Some other content that should not leak into the FAQ answer.
`;
    expect(parseFaqSection(md)).toEqual([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
  });

  test("never throws on empty input", () => {
    expect(parseFaqSection("")).toEqual([]);
  });

  // The shape the blog generator actually emits (seen on prod, 24clima):
  // bold-lead paragraphs instead of ### sub-headings.
  test("bold-lead paragraphs (real generator output)", () => {
    const md = `## Preguntas frecuentes

**¿Cuánto cuesta el mantenimiento preventivo?**
El precio varía según el tipo de equipo. La limpieza comienza desde $29.99.

**¿El mantenimiento cubre la recarga de gas refrigerante?**
No necesariamente. La recarga es un servicio independiente.
`;
    expect(parseFaqSection(md)).toEqual([
      {
        question: "¿Cuánto cuesta el mantenimiento preventivo?",
        answer:
          "El precio varía según el tipo de equipo. La limpieza comienza desde $29.99.",
      },
      {
        question: "¿El mantenimiento cubre la recarga de gas refrigerante?",
        answer: "No necesariamente. La recarga es un servicio independiente.",
      },
    ]);
  });

  test("plural FAQs heading", () => {
    const md = `## FAQs

### Q1?

A1.

### Q2?

A2.
`;
    expect(parseFaqSection(md)).toEqual([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
  });

  test("bold question with answer on the same line", () => {
    const md = `## FAQ

**Q1?** First answer here.

**Q2?** Second answer here.
`;
    expect(parseFaqSection(md)).toEqual([
      { question: "Q1?", answer: "First answer here." },
      { question: "Q2?", answer: "Second answer here." },
    ]);
  });
});
