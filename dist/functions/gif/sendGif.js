"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const { parseGIF, decompressFrames } = require('gifuct-js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

exports.default = new forgescript_1.NativeFunction({
    name: '$sendGif',
    description: 'Loads a GIF file with enhanced frame processing capabilities.',
    version: '1.3.0',
    brackets: true,
    unwrap: true,
    args: [
        {
            name: 'gif',
            description: 'Name of the GIF encoder.',
            type: forgescript_1.ArgType.String,
            required: false,
            rest: false
        },
        {
            name: 'path',
            description: 'Path to the GIF file.',
            type: forgescript_1.ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'speed',
            description: 'Frame rgb quantization speed (1-30).',
            type: forgescript_1.ArgType.Number,
            check: (x) => x >= 1 && x <= 30,
            required: false,
            rest: false
        }
    ],
    async execute(ctx, [name, path, speed = 10]) {
        const encoder = name
            ? ctx.gifManager?.getEncoder(name)
            : ctx.gifManager?.lastCurrentEncoder;
        
        if (!encoder)
            return this.customError(__1.FCError.NoEncoder);

        try {
            // 1. Carrega o buffer do GIF
            const gifBuffer = fs.readFileSync(path);
            
            // 2. Separa os frames com gifuct-js
            const gif = parseGIF(gifBuffer);
            const frames = decompressFrames(gif, true);
            
            if (!frames || frames.length === 0) {
                return this.customError('No frames found in GIF');
            }

            // Armazena informações do GIF original
            encoder.originalWidth = gif.lsd?.width || frames[0].dims.width;
            encoder.originalHeight = gif.lsd?.height || frames[0].dims.height;
            encoder.frameCount = frames.length;
            encoder.frames = []; // Array para armazenar frames processados

            // 3. Processa cada frame
            for (let i = 0; i < frames.length; i++) {
                const frame = frames[i];
                const { width, height, delay, disposalType, left, top } = frame.dims || frame;
                
                // 4. Cria canvas para o frame
                const canvas = createCanvas(
                    encoder.originalWidth, 
                    encoder.originalHeight
                );
                const ctx = canvas.getContext('2d');
                
                // 5. Se não é o primeiro frame, considera disposal method
                if (i > 0) {
                    await this.handleDisposalMethod(ctx, encoder.frames[i - 1], canvas);
                }
                
                // 6. Converte os dados do frame para ImageData
                const frameCanvas = createCanvas(width, height);
                const frameCtx = frameCanvas.getContext('2d');
                const imageData = frameCtx.createImageData(width, height);
                
                // gifuct-js retorna dados RGBA
                for (let j = 0; j < frame.patch.length; j += 4) {
                    const pixelIndex = j;
                    imageData.data[pixelIndex] = frame.patch[j];     // R
                    imageData.data[pixelIndex + 1] = frame.patch[j + 1]; // G
                    imageData.data[pixelIndex + 2] = frame.patch[j + 2]; // B
                    imageData.data[pixelIndex + 3] = frame.patch[j + 3]; // A
                }
                
                // 7. Desenha os dados no canvas do frame
                frameCtx.putImageData(imageData, 0, 0);
                
                // 8. Posiciona o frame no canvas principal
                ctx.drawImage(frameCanvas, left || 0, top || 0);
                
                // 9. Cria objeto frame personalizado para armazenar no encoder
                const processedFrame = {
                    canvas: canvas,
                    ctx: ctx,
                    width: encoder.originalWidth,
                    height: encoder.originalHeight,
                    delay: delay || 100,
                    left: left || 0,
                    top: top || 0,
                    disposalType: disposalType,
                    index: i,
                    data: null // Será preenchido quando necessário
                };
                
                // 10. Armazena o frame processado
                encoder.frames.push(processedFrame);
            }
            
            return this.success();
            
        } catch (error) {
            return this.customError(`Failed to process GIF: ${error.message}`);
        }
    },

    async handleDisposalMethod(ctx, previousFrame, canvas) {
        if (!previousFrame) return;
        
        switch (previousFrame.disposalType) {
            case 1: // Do not dispose (keep previous frame)
                // Mantém o frame anterior como base
                break;
            case 2: // Restore to background color
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                break;
            case 3: // Restore to previous
                // Implementação complexa - por enquanto mantém
                break;
            default:
                // Comportamento padrão
                break;
        }
    },

    // Método para finalizar e converter frames para o encoder
    finalizeFrames(encoder) {
        if (!encoder.frames) return;
        
        for (const frame of encoder.frames) {
            // Converte canvas para buffer se necessário
            if (frame.canvas && !frame.buffer) {
                frame.buffer = frame.canvas.toBuffer('image/png');
            }
            
            // Resolve o frame usando o método do projeto
            const resolvedFrame = __1.CanvasUtil.resolveFrame(
                this, 
                null, // ctx será passado diferentemente
                frame.buffer, 
                10 // speed padrão
            );
            
            if (resolvedFrame) {
                resolvedFrame.delay = frame.delay;
                resolvedFrame.left = frame.left;
                resolvedFrame.top = frame.top;
                resolvedFrame.dispose = frame.disposalType;
                
                encoder.addFrame(resolvedFrame);
            }
        }
        
        // Limpa frames temporários
        encoder.frames = [];
    }
});
