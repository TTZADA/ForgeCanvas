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

    // Helper function to get the last custom emoji in text
    const getLastCustomEmoji = (text) => {
        const regex = /<a?:\w+:\d+>/g;
        let lastMatch = null;
        let match;
        
        while ((match = regex.exec(text))) {
            lastMatch = {
                emoji: match[0],
                start: match.index,
                end: match.index + match[0].length
            };
        }
        
        return lastMatch;
    };

    // Helper function to check if we can keep the last custom emoji intact
    const canKeepLastCustomEmoji = (currentLine, word, maxWidth) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const lastEmoji = getLastCustomEmoji(testLine);
        
        if (!lastEmoji) return false;
        
        // Check if the emoji is at the very end of the line
        if (lastEmoji.end !== testLine.length) return false;
        
        // Measure text without the last emoji
        const textWithoutLastEmoji = testLine.slice(0, lastEmoji.start);
        const widthWithoutEmoji = measureMixedText(textWithoutLastEmoji);
        
        // If text without emoji fits, allow keeping the emoji even if total exceeds maxWidth
        return widthWithoutEmoji <= maxWidth;
    };

    // Improved line breaking function
    const breakIntoLines = (inputText) => {
        let lines = [];
        
        if (multiline) {
            // Handle explicit line breaks first
            const explicitLines = inputText.split('\n');
            
            for (const explicitLine of explicitLines) {
                if (maxWidth) {
                    if (wrap) {
                        // Word wrapping with custom emoji preservation
                        const words = explicitLine.split(' ');
                        let currentLine = '';
                        
                        for (const word of words) {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            const testWidth = measureMixedText(testLine);
                            
                            if (testWidth > maxWidth && currentLine !== '') {
                                // Check if we can keep the last custom emoji
                                if (canKeepLastCustomEmoji(currentLine, word, maxWidth)) {
                                    currentLine = testLine;
                                } else {
                                    lines.push(currentLine);
                                    currentLine = word;
                                }
                            } else {
                                currentLine = testLine;
                            }
                        }
                        
                        if (currentLine !== '') {
                            lines.push(currentLine);
                        }
                    } else {
                        // Character breaking with custom emoji preservation
                        const lineWidth = measureMixedText(explicitLine);
                        const lastEmoji = getLastCustomEmoji(explicitLine);
                        
                        if (lineWidth > maxWidth && lastEmoji && lastEmoji.end === explicitLine.length) {
                            // Check if we can keep the last emoji
                            const textWithoutLastEmoji = explicitLine.slice(0, lastEmoji.start);
                            const widthWithoutEmoji = measureMixedText(textWithoutLastEmoji);
                            
                            if (widthWithoutEmoji <= maxWidth) {
                                // Keep the line intact with the emoji
                                lines.push(explicitLine);
                            } else {
                                // Break normally
                                lines.push(...breakLineByCharacters(explicitLine, maxWidth));
                            }
                        } else if (lineWidth > maxWidth) {
                            lines.push(...breakLineByCharacters(explicitLine, maxWidth));
                        } else {
                            lines.push(explicitLine);
                        }
                    }
                } else {
                    lines.push(explicitLine);
                }
            }
        } else {
            // Single line mode but still respect maxWidth
            if (maxWidth) {
                const totalWidth = measureMixedText(inputText);
                const lastEmoji = getLastCustomEmoji(inputText);
                
                if (totalWidth > maxWidth && lastEmoji && lastEmoji.end === inputText.length) {
                    // Check if we can keep the last emoji
                    const textWithoutLastEmoji = inputText.slice(0, lastEmoji.start);
                    const widthWithoutEmoji = measureMixedText(textWithoutLastEmoji);
                    
                    if (widthWithoutEmoji <= maxWidth) {
                        // Keep the line intact with the emoji
                        lines = [inputText];
                    } else if (wrap) {
                        // Word wrapping
                        const words = inputText.split(' ');
                        let currentLine = '';
                        
                        for (const word of words) {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            const testWidth = measureMixedText(testLine);
                            
                            if (testWidth > maxWidth && currentLine !== '') {
                                if (canKeepLastCustomEmoji(currentLine, word, maxWidth)) {
                                    currentLine = testLine;
                                } else {
                                    lines.push(currentLine);
                                    currentLine = word;
                                }
                            } else {
                                currentLine = testLine;
                            }
                        }
                        
                        if (currentLine !== '') {
                            lines.push(currentLine);
                        }
                    } else {
                        lines.push(...breakLineByCharacters(inputText, maxWidth));
                    }
                } else if (totalWidth > maxWidth) {
                    if (wrap) {
                        lines.push(...breakIntoLines(inputText));
                    } else {
                        lines.push(...breakLineByCharacters(inputText, maxWidth));
                    }
                } else {
                    lines = [inputText];
                }
            } else {
                lines = [inputText];
            }
        }
        
        return lines;
    };

    // Helper function for character-level breaking
    const breakLineByCharacters = (text, maxWidth) => {
        const lines = [];
        let currentLine = '';
        const regex = /<a?:\w+:\d+>/g;
        let lastIndex = 0;
        let match;
        
        while ((match = regex.exec(text))) {
            // Process text before emoji
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
            
            // Add the complete emoji
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
        
        // Process remaining text
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
        
        return lines;
    };

    // Split text into lines using improved logic
    const lines = breakIntoLines(text);

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
