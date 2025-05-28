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

    // Helper function to check if URL exists (with cache)
    const urlCache = new Map();
    const checkUrl = async (url) => {
        if (urlCache.has(url)) {
            return urlCache.get(url);
        }
        
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const exists = response.ok;
            urlCache.set(url, exists);
            return exists;
        } catch (error) {
            urlCache.set(url, false);
            return false;
        }
    };

    // Helper function to measure text width including emojis
    const measureMixedText = (text) => {
        const regex = /<a?:(\w+):(\d+)>|([\p{Emoji_Presentation}\p{Emoji}\uFE0F]+)/gu;
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

    // Helper function to check if a word contains custom emoji that shouldn't be broken
    const containsCustomEmoji = (text) => {
        return /<a?:\w+:\d+>/.test(text);
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
                        
                        // Se a palavra contém emoji personalizado, não quebrar mesmo se exceder maxWidth
                        if (testWidth > maxWidth && currentLine !== '' && !containsCustomEmoji(word)) {
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
                    // Sem wrap, mas ainda respeitando emojis personalizados
                    const lineWidth = measureMixedText(explicitLine);
                    if (lineWidth > maxWidth && !containsCustomEmoji(explicitLine)) {
                        // Quebrar caractere por caractere, mas preservando emojis personalizados
                        let currentLine = '';
                        const regex = /<a?:\w+:\d+>/g;
                        let lastIndex = 0;
                        let match;
                        
                        while ((match = regex.exec(explicitLine))) {
                            // Processar texto antes do emoji
                            const beforeEmoji = explicitLine.slice(lastIndex, match.index);
                            for (let i = 0; i < beforeEmoji.length; i++) {
                                const char = beforeEmoji[i];
                                const testLine = currentLine + char;
                                const testWidth = measureMixedText(testLine);
                                
                                if (testWidth > maxWidth && currentLine !== '') {
                                    lines.push(currentLine);
                                    currentLine = char;
                                } else {
                                    currentLine = testLine;
                                }
                            }
                            
                            // Adicionar o emoji completo
                            const emojiTestLine = currentLine + match[0];
                            const emojiTestWidth = measureMixedText(emojiTestLine);
                            
                            if (emojiTestWidth > maxWidth && currentLine !== '') {
                                lines.push(currentLine);
                                currentLine = match[0];
                            } else {
                                currentLine = emojiTestLine;
                            }
                            
                            lastIndex = match.index + match[0].length;
                        }
                        
                        // Processar texto restante
                        const remaining = explicitLine.slice(lastIndex);
                        for (let i = 0; i < remaining.length; i++) {
                            const char = remaining[i];
                            const testLine = currentLine + char;
                            const testWidth = measureMixedText(testLine);
                            
                            if (testWidth > maxWidth && currentLine !== '') {
                                lines.push(currentLine);
                                currentLine = char;
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
                    // Com wrap, quebrar por palavras respeitando emojis personalizados
                    const words = text.split(' ');
                    let currentLine = '';
                    
                    for (const word of words) {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const testWidth = measureMixedText(testLine);
                        
                        // Se a palavra contém emoji personalizado, não quebrar mesmo se exceder maxWidth
                        if (testWidth > maxWidth && currentLine !== '' && !containsCustomEmoji(word)) {
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
                    // Aplicar a mesma lógica do multiline sem wrap
                    if (!containsCustomEmoji(text)) {
                        let currentLine = '';
                        const regex = /<a?:\w+:\d+>/g;
                        let lastIndex = 0;
                        let match;
                        
                        while ((match = regex.exec(text))) {
                            // Processar texto antes do emoji
                            const beforeEmoji = text.slice(lastIndex, match.index);
                            for (let i = 0; i < beforeEmoji.length; i++) {
                                const char = beforeEmoji[i];
                                const testLine = currentLine + char;
                                const testWidth = measureMixedText(testLine);
                                
                                if (testWidth > maxWidth && currentLine !== '') {
                                    lines.push(currentLine);
                                    currentLine = char;
                                } else {
                                    currentLine = testLine;
                                }
                            }
                            
                            // Adicionar o emoji completo
                            const emojiTestLine = currentLine + match[0];
                            const emojiTestWidth = measureMixedText(emojiTestLine);
                            
                            if (emojiTestWidth > maxWidth && currentLine !== '') {
                                lines.push(currentLine);
                                currentLine = match[0];
                            } else {
                                currentLine = emojiTestLine;
                            }
                            
                            lastIndex = match.index + match[0].length;
                        }
                        
                        // Processar texto restante
                        const remaining = text.slice(lastIndex);
                        for (let i = 0; i < remaining.length; i++) {
                            const char = remaining[i];
                            const testLine = currentLine + char;
                            const testWidth = measureMixedText(testLine);
                            
                            if (testWidth > maxWidth && currentLine !== '') {
                                lines.push(currentLine);
                                currentLine = char;
                            } else {
                                currentLine = testLine;
                            }
                        }
                        
                        if (currentLine !== '') {
                            lines.push(currentLine);
                        }
                    } else {
                        // Texto com emoji personalizado - renderizar mesmo excedendo maxWidth
                        lines = [text];
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
        const regex = /<a?:(\w+):(\d+)>|([\p{Emoji_Presentation}\p{Emoji}\uFE0F]+)/gu;
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
            let shouldTryLoad = true;
            
            if (id) {
                // Discord custom emoji
                const ext = full.startsWith('<a:') ? 'gif' : 'png';
                url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
            } else if (unicode) {
                // Unicode emoji - use Twemoji API with better codepoint handling
                const codepoints = [];
                for (const char of unicode) {
                    const code = char.codePointAt(0);
                    if (code) {
                        codepoints.push(code.toString(16));
                    }
                }
                
                if (codepoints.length > 0) {
                    const codepointStr = codepoints.join('-');
                    url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepointStr}.png`;
                } else {
                    shouldTryLoad = false;
                }
            }

            if (url && shouldTryLoad) {
                try {
                    // Check if URL exists before trying to load
                    const urlExists = await checkUrl(url);
                    
                    if (urlExists) {
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
                    } else {
                        // URL doesn't exist, render as text fallback
                        const fallbackText = name || unicode || full;
                        if (mode === __1.FillOrStroke.fill) {
                            canvas.ctx.fillText(fallbackText, cursorX, lineY);
                        } else {
                            canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                        }
                    }
                    cursorX += size;
                } catch (error) {
                    // If emoji fails to load, render as text fallback
                    console.warn(`Failed to load emoji: ${url}`, error);
                    const fallbackText = name || unicode || full;
                    if (mode === __1.FillOrStroke.fill) {
                        canvas.ctx.fillText(fallbackText, cursorX, lineY);
                    } else {
                        canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                    }
                    cursorX += canvas.ctx.measureText(fallbackText).width;
                }
            } else {
                // No valid URL, render as text
                const fallbackText = name || unicode || full;
                if (mode === __1.FillOrStroke.fill) {
                    canvas.ctx.fillText(fallbackText, cursorX, lineY);
                } else {
                    canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                }
                cursorX += canvas.ctx.measureText(fallbackText).width;
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
