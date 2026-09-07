/**
 * Маркдаун → запити форматування Google Docs.
 *
 * Модель пише інструкції маркдауном, а в документ це лягало як є: людина бачила
 * «## 1. ЦКП» і зірочки замість жирного. Технічно правильно, читати неможливо —
 * а інструкцію читає не програма, а нова людина в перший робочий день.
 *
 * Тому текст очищаємо від розмітки, а замість неї віддаємо Docs API стилі. Стилі
 * не змінюють довжину тексту, тож індекси рахуються один раз по чистому тексту й
 * лишаються дійсними для всіх наступних запитів у тій самій пачці.
 */

export interface DocContent {
  /** Текст без розмітки — саме він вставляється в документ. */
  plain: string;
  /** Запити стилів; застосовувати ПІСЛЯ вставки тексту. */
  requests: unknown[];
}

interface Line {
  text: string;
  /** 0 — звичайний абзац, 1..3 — рівень заголовка. */
  heading: number;
  bullet: boolean;
  /** Жирні відрізки у координатах цього рядка. */
  bold: Array<{ from: number; to: number }>;
}

/** Витягнути **жирне**, повернувши чистий рядок і межі жирних відрізків. */
function extractBold(raw: string): { text: string; bold: Array<{ from: number; to: number }> } {
  const bold: Array<{ from: number; to: number }> = [];
  let text = '';
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith('**', i)) {
      const end = raw.indexOf('**', i + 2);
      if (end > i + 2) {
        const inner = raw.slice(i + 2, end);
        bold.push({ from: text.length, to: text.length + inner.length });
        text += inner;
        i = end + 2;
        continue;
      }
    }
    text += raw[i];
    i += 1;
  }
  return { text, bold };
}

function parseLine(raw: string): Line {
  let s = raw.replace(/\s+$/, '');

  const h = s.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const { text, bold } = extractBold(h[2]);
    return { text, heading: Math.min(h[1].length, 3), bullet: false, bold };
  }

  // Списки модель пише і як «* », і як «- », і як «*   » з вирівнюванням.
  const b = s.match(/^\s*[*-]\s+(.*)$/);
  if (b) {
    const { text, bold } = extractBold(b[1]);
    return { text, heading: 0, bullet: true, bold };
  }

  const { text, bold } = extractBold(s);
  return { text, heading: 0, bullet: false, bold };
}

const NAMED_STYLE = ['NORMAL_TEXT', 'HEADING_1', 'HEADING_2', 'HEADING_3'];

/**
 * Розібрати маркдаун на чистий текст і стилі.
 *
 * `startIndex` — куди вставлятимемо текст (у Docs тіло починається з 1).
 */
export function markdownToDoc(markdown: string, startIndex = 1): DocContent {
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .replace(/```(?:markdown)?/gi, '')
    .split('\n')
    .map(parseLine);

  // Перший заголовок у документі — його назва, і вона має виглядати як назва.
  const firstHeading = lines.findIndex((l) => l.heading > 0);
  if (firstHeading >= 0) lines[firstHeading].heading = 1;

  const plain = lines.map((l) => l.text).join('\n') + '\n';

  const requests: unknown[] = [];
  const bulletRuns: Array<{ start: number; end: number }> = [];
  let cursor = startIndex;

  for (const line of lines) {
    const from = cursor;
    const to = cursor + line.text.length;
    cursor = to + 1; // «+1» — символ переводу рядка

    if (line.heading > 0) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: from, endIndex: cursor },
          paragraphStyle: {
            namedStyleType: NAMED_STYLE[line.heading],
            // Заголовок, що злипся з попереднім абзацом, читається як його продовження.
            spaceAbove: { magnitude: line.heading === 1 ? 0 : 14, unit: 'PT' },
            spaceBelow: { magnitude: 6, unit: 'PT' },
          },
          fields: 'namedStyleType,spaceAbove,spaceBelow',
        },
      });
    }

    if (line.bullet && line.text) {
      const last = bulletRuns[bulletRuns.length - 1];
      if (last && last.end === from) last.end = cursor;
      else bulletRuns.push({ start: from, end: cursor });
    }

    for (const b of line.bold) {
      if (b.to <= b.from) continue;
      requests.push({
        updateTextStyle: {
          range: { startIndex: from + b.from, endIndex: from + b.to },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
    }
  }

  // Марковані списки — останніми: вони не рухають індекси, але міняють абзацний
  // стиль, тож простіше не змішувати їх з рештою.
  for (const run of bulletRuns) {
    requests.push({
      createParagraphBullets: {
        range: { startIndex: run.start, endIndex: run.end },
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
      },
    });
  }

  return { plain, requests };
}
