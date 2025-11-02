import { NativeFunction, ArgType, Return } from '@tryforge/forgescript';
import { CanvasUtil, FCError, FillOrStroke } from '../..';

const emojiCache = new Map<string, any>();

export default new NativeFunction({
    name: '$drawText',
    aliases: ['$placeText', '$text', '$writeText', '$addText'],
    description: 'Draws text with emojis on a canvas.',
    version: '1.0.0',
    brackets: true,
    unwrap: true,
    args: [
        {
            name: 'canvasName',
            description: 'Name of the canvas.',
            type: ArgType.String,
            required: false,
            rest: false
        },
        {
            name: 'mode',
            description: 'The mode of function.',
            type: ArgType.Enum,
            enum: FillOrStroke,
            required: true,
            rest: false
        },
        {
            name: 'text',
            description: 'The text.',
            type: ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'font',
            description: 'The font of text.',
            type: ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'style',
            description: 'The style text.',
            type: ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'x',
            description: 'The image start X coordinate.',
            type: ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'y',
            description: 'The image start Y coordinate.',
            type: ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'emojiSize',
            description: 'The emoji size.',
            type: ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'maxWidth',
            description: 'Maximum font width.',
            type: ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'multiline',
            description: 'Indicates if the text should be drawn in multiple lines if it exceeds the maximum width.',
            type: ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'wrap',
            description: 'Wraps the text if true.',
            type: ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'lineOffset',
            description: 'The text lines offset.',
            type: ArgType.Number,
            required: false,
            rest: false
        },
    ],
    async execute (ctx, [canvasName, mode, text, font, style, x, y, emojiSize, maxWidth, multiline, wrap, lineOffset]) {
        const canvas = canvasName
            ? ctx.canvasManager?.get(canvasName)
            : ctx.canvasManager?.lastCurrent;
        if (!canvas) return this.customError(FCError.NoCanvas);

        if (font) canvas.ctx.font = font;
        const styleProp = mode === FillOrStroke.fill ? 'fillStyle' : 'strokeStyle';
        const prevStyle = canvas.ctx[styleProp];
        const resolved = style
            ? await CanvasUtil.resolveStyle(this, ctx, canvas, style)
            : null;
        if (resolved instanceof Return) return resolved;
        if (resolved) canvas.ctx[styleProp] = resolved;

        const size = emojiSize || parseInt(canvas.ctx.font) || 16;
        const actualLineOffset = lineOffset || size * 1.2;

        const emojiRegex = /<a?:(\w+):(\d+)>|(\p{Emoji}(?:\u200D\p{Emoji})*(?:\uFE0F)?)/gu;

        const measureMixedText = (text: string) => {
            let width = 0;
            let lastIndex = 0;
            let match;
            const regex = new RegExp(emojiRegex);

            while ((match = regex.exec(text))) {
                if (match.index > lastIndex) {
                    const segment = text.slice(lastIndex, match.index);
                    width += canvas.ctx.measureText(segment).width;
                }
                width += size;
                lastIndex = regex.lastIndex;
            }

            if (lastIndex < text.length) {
                const rest = text.slice(lastIndex);
                width += canvas.ctx.measureText(rest).width;
            }

            return width;
        };

        let lines: string[] = [];
        if ((multiline || wrap) && maxWidth) {
            const tokens = text.split(/(\s+)/).filter(t => t.length > 0);
            let currentLine = '';

            const addToken = (token: string) => {
                const testLine = currentLine + token;
                const testWidth = measureMixedText(testLine);
                if (testWidth <= maxWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine) {
                        lines.push(currentLine);
                        currentLine = '';
                    }
                    if (token.trim() === '') {
                    } else {
                        hardWrap(token);
                    }
                }
            };

            const hardWrap = (word: string) => {
                let remaining = word;
                while (measureMixedText(remaining) > maxWidth) {
                    let subLine = '';
                    let subWidth = 0;
                    let lastIndex = 0;
                    const regex = new RegExp(emojiRegex);
                    let match;
                    let broke = false;
                    while ((match = regex.exec(remaining)) && !broke) {
                        const segment = remaining.slice(lastIndex, match.index);
                        for (const ch of segment) {
                            const chWidth = canvas.ctx.measureText(ch).width;
                            if (subWidth + chWidth > maxWidth) {
                                broke = true;
                                break;
                            }
                            subLine += ch;
                            subWidth += chWidth;
                        }
                        if (broke) break;
                        const eWidth = size;
                        if (subWidth + eWidth > maxWidth) {
                            broke = true;
                            break;
                        }
                        subLine += match[0];
                        subWidth += eWidth;
                        lastIndex = regex.lastIndex;
                    }
                    if (!broke) {
                        const rest = remaining.slice(lastIndex);
                        for (const ch of rest) {
                            const chWidth = canvas.ctx.measureText(ch).width;
                            if (subWidth + chWidth > maxWidth) {
                                broke = true;
                                break;
                            }
                            subLine += ch;
                            subWidth += chWidth;
                        }
                    }
                    lines.push(subLine);
                    remaining = remaining.slice(subLine.length);
                }
                if (remaining) {
                    currentLine = remaining;
                }
            };

            tokens.forEach(addToken);
            if (currentLine) lines.push(currentLine);
        } else {
            lines = [text];
        }

        const emojiPromises: Promise<void>[] = [];
        const emojiData: Array<{ url: string; x: number; y: number }> = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            const lineY = y + (lineIndex * actualLineOffset);
            let cursorX = x;

            const regex = new RegExp(emojiRegex);
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(lineText))) {
                const [full, name, id, unicode] = match;
                
                if (match.index > lastIndex) {
                    const segment = lineText.slice(lastIndex, match.index);
                    canvas.text(
                        mode,
                        segment,
                        cursorX,
                        lineY,
                        font,
                        maxWidth,
                        false,
                        false,
                        0
                    );
                    cursorX += canvas.ctx.measureText(segment).width;
                }

                let url: string;
                if (id) {
                    const ext = full.startsWith('<a:') ? 'gif' : 'png';
                    url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
                } else if (unicode) {
                    const codepoints = Array.from(unicode)
                        .map(c => c.codePointAt(0)!.toString(16))
                        .join('-')
                        .replace(/-fe0f/g, '');
                    url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${codepoints}.png`;
                } else {
                    url = '';
                }

                if (url) {
                    emojiData.push({ url, x: cursorX, y: lineY - size });
                    
                    if (!emojiCache.has(url)) {
                        emojiPromises.push(
                            CanvasUtil.resolveImage(this, ctx, url).then(img => {
                                if (!(img instanceof Return)) {
                                    emojiCache.set(url, img);
                                }
                            })
                        );
                    }
                    
                    cursorX += size;
                }

                lastIndex = regex.lastIndex;
            }

            if (lastIndex < lineText.length) {
                const rest = lineText.slice(lastIndex);
                canvas.text(
                    mode,
                    rest,
                    cursorX,
                    lineY,
                    font,
                    maxWidth,
                    false,
                    false,
                    0
                );
            }
        }

        await Promise.all(emojiPromises);

        for (const { url, x: emojiX, y: emojiY } of emojiData) {
            const img = emojiCache.get(url);
            if (img) {
                await canvas.drawImage(img, emojiX, emojiY, size, size);
            }
        }

        canvas.ctx[styleProp] = prevStyle;
        return this.success();
    }
});
