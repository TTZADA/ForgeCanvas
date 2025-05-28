"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");

exports.default = new forgescript_1.NativeFunction({
    name: '$drawText',
    aliases: ['$placeText', '$text', '$writeText', '$addText'],
    description: 'Draws a filled/stroked text on a canvas.',
    version: '1.0.0',
    brackets: true,
    unwrap: true,
    args: [
        {
            name: 'canvasName',
            description: 'Name of the canvas.',
            type: forgescript_1.ArgType.String,
            required: false,
            rest: false
        },
        {
            name: 'mode',
            description: 'The mode of function.',
            type: forgescript_1.ArgType.Enum,
            enum: __1.FillOrStroke,
            required: true,
            rest: false
        },
        {
            name: 'text',
            description: 'The text.',
            type: forgescript_1.ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'font',
            description: 'The font of text.',
            type: forgescript_1.ArgType.String,
            check: (i) => __1.CanvasUtil.isValidFont(i),
            required: true,
            rest: false
        },
        {
            name: 'style',
            description: 'The style text.',
            type: forgescript_1.ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'x',
            description: 'The image start X coordinate.',
            type: forgescript_1.ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'y',
            description: 'The image start Y coordinate.',
            type: forgescript_1.ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'emojiSize',
            description: 'The emoji size.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'maxWidth',
            description: 'Maximum font width.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'multiline',
            description: 'Indicates if the text should be drawn in multiple lines if it exceeds the maximum width.',
            type: forgescript_1.ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'wrap',
            description: 'Wraps the text if true.',
            type: forgescript_1.ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'lineOffset',
            description: 'The text lines offset.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
    ],
async execute(ctx, [canvasName, mode, text, font, style, x, y, emojiSize, maxWidth, multiline, wrap, lineOffset]) {
    const canvas = canvasName
        ? ctx.canvasManager?.get(canvasName)
        : ctx.canvasManager?.lastCurrent;
    if (!canvas) return this.customError(__1.FCError.NoCanvas);

    // Apply font and style
    if (font) canvas.ctx.font = font;
    const styleProp = mode === __1.FillOrStroke.fill ? 'fillStyle' : 'strokeStyle';
    const prevStyle = canvas.ctx[styleProp];
    const resolved = style
        ? await __1.CanvasUtil.resolveStyle(this, ctx, canvas, style)
        : null;
    if (resolved instanceof forgescript_1.Return) return resolved;
    if (resolved) canvas.ctx[styleProp] = resolved;

    // Determine emoji draw size
    const size = emojiSize || parseInt(canvas.ctx.font) || 16;
    const actualLineOffset = lineOffset || size * 1.2; // Default line spacing

    // Helper function to measure text width including emojis
    const measureMixedText = (text) => {
        const regex = /<a?:(\w+):(\d+)>|([\p{Emoji_Presentation}\uFE0F])/gu;
        let width = 0;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text))) {
            // Add width of text before emoji
            if (match.index > lastIndex) {
                const segment = text.slice(lastIndex, match.index);
                width += canvas.ctx.measureText(segment).width;
            }
            // Add emoji width
            width += size;
            lastIndex = regex.lastIndex;
        }

        // Add remaining text width
        if (lastIndex < text.length) {
            const rest = text.slice(lastIndex);
            width += canvas.ctx.measureText(rest).width;
        }

        return width;
    };

    // Split text into lines
    let lines = [];
    
    if (multiline) {
        // Se multiline for true, primeiro dividir por quebras de linha explícitas (\n)
        const explicitLines = text.split('\n');
        
        for (const explicitLine of explicitLines) {
            if (maxWidth) {
                // Com maxWidth, sempre quebrar linhas que excedam o limite
                if (wrap) {
                    // Com wrap, quebrar por palavras
                    const words = explicitLine.split(' ');
                    let currentLine = '';
                    
                    for (const word of words) {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const testWidth = measureMixedText(testLine);
                        
                        if (testWidth > maxWidth && currentLine !== '') {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    
                    if (currentLine !== '') {
                        lines.push(currentLine);
                    }
                } else {
                    // Sem wrap, verificar se a linha inteira cabe
                    const lineWidth = measureMixedText(explicitLine);
                    if (lineWidth > maxWidth) {
                        // Quebrar caractere por caractere quando necessário
                        let currentLine = '';
                        
                        for (let i = 0; i < explicitLine.length; i++) {
                            const testLine = currentLine + explicitLine[i];
                            const testWidth = measureMixedText(testLine);
                            
                            if (testWidth > maxWidth && currentLine !== '') {
                                lines.push(currentLine);
                                currentLine = explicitLine[i];
                            } else {
                                currentLine = testLine;
                            }
                        }
                        
                        if (currentLine !== '') {
                            lines.push(currentLine);
                        }
                    } else {
                        lines.push(explicitLine);
                    }
                }
            } else {
                // Sem maxWidth, apenas adicionar a linha como está
                lines.push(explicitLine);
            }
        }
    } else {
        // Sem multiline, mas com maxWidth sempre criar nova linha quando necessário
        if (maxWidth) {
            const totalWidth = measureMixedText(text);
            
            if (totalWidth > maxWidth) {
                if (wrap) {
                    // Com wrap, quebrar por palavras
                    const words = text.split(' ');
                    let currentLine = '';
                    
                    for (const word of words) {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const testWidth = measureMixedText(testLine);
                        
                        if (testWidth > maxWidth && currentLine !== '') {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    
                    if (currentLine !== '') {
                        lines.push(currentLine);
                    }
                } else {
                    // Sem wrap, quebrar caractere por caractere quando necessário
                    let currentLine = '';
                    
                    for (let i = 0; i < text.length; i++) {
                        const testLine = currentLine + text[i];
                        const testWidth = measureMixedText(testLine);
                        
                        if (testWidth > maxWidth && currentLine !== '') {
                            lines.push(currentLine);
                            currentLine = text[i];
                        } else {
                            currentLine = testLine;
                        }
                    }
                    
                    if (currentLine !== '') {
                        lines.push(currentLine);
                    }
                }
            } else {
                // Texto cabe em uma linha
                lines = [text];
            }
        } else {
            // Sem maxWidth nem multiline - uma linha apenas
            lines = [text];
        }
    }

    // Helper function to draw mixed text and emojis for a single line
    const drawMixedLine = async (lineText, lineX, lineY) => {
        const regex = /<a?:(\w+):(\d+)>|([\p{Emoji_Presentation}\uFE0F])/gu;
        let cursorX = lineX;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(lineText))) {
            const [full, name, id, unicode] = match;
            
            // Draw preceding text
            if (match.index > lastIndex) {
                const segment = lineText.slice(lastIndex, match.index);
                if (segment) {
                    if (mode === __1.FillOrStroke.fill) {
                        canvas.ctx.fillText(segment, cursorX, lineY);
                    } else {
                        canvas.ctx.strokeText(segment, cursorX, lineY);
                    }
                    cursorX += canvas.ctx.measureText(segment).width;
                }
            }

            // Resolve and draw emoji
            let url;
            if (id) {
                // Discord custom emoji
                const ext = full.startsWith('<a:') ? 'gif' : 'png';
                url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
            } else if (unicode) {
                // Unicode emoji - use Twemoji API
                const codepoint = Array.from(unicode)
                    .map(c => c.codePointAt(0).toString(16))
                    .join('-');
                url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoint}.png`;
            }

            if (url) {
                try {
                    const img = await __1.CanvasUtil.resolveImage(this, ctx, url);
                    if (img instanceof forgescript_1.Return) return img;
                    
                    // Draw emoji aligned with text baseline
                    canvas.ctx.drawImage(
                        img,
                        cursorX,
                        lineY - size + (size * 0.2), // Adjust vertical position for better alignment
                        size,
                        size
                    );
                    cursorX += size;
                } catch (error) {
                    // If emoji fails to load, skip it and continue
                    console.warn(`Failed to load emoji: ${url}`, error);
                }
            }

            lastIndex = regex.lastIndex;
        }

        // Draw remaining text in the line
        if (lastIndex < lineText.length) {
            const rest = lineText.slice(lastIndex);
            if (rest) {
                if (mode === __1.FillOrStroke.fill) {
                    canvas.ctx.fillText(rest, cursorX, lineY);
                } else {
                    canvas.ctx.strokeText(rest, cursorX, lineY);
                }
            }
        }
    };

    // Draw each line
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineText = lines[lineIndex];
        const lineY = y + (lineIndex * actualLineOffset);
        
        await drawMixedLine(lineText, x, lineY);
    }

    // Restore style
    canvas.ctx[styleProp] = prevStyle;
    return this.success();
}
})
