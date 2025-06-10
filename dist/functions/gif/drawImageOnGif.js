"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const classes_1 = require("../../classes");

exports.default = new forgescript_1.NativeFunction({
    name: '$drawImageOnGif',
    aliases: ['$placeImageOnGif', '$overlayImageOnGif'],
    description: 'Draws an image on GIF frames during processing.',
    version: '1.0.0',
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
            name: 'src',
            description: 'The image source.',
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
            name: 'width',
            description: 'The image width.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'height',
            description: 'The image height.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'frameIndex',
            description: 'Specific frame index to draw on (-1 for all frames).',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'radius',
            description: 'The image radius for rounded corners.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: true
        }
    ],
    async execute(ctx, [name, src, x, y, width, height, frameIndex = -1, radius]) {
        const encoder = name
            ? ctx.gifManager?.getEncoder(name)
            : ctx.gifManager?.lastCurrentEncoder;
        
        if (!encoder)
            return this.customError(classes_1.FCError.NoEncoder);

        // Resolve a imagem uma vez para eficiência
        const img = await classes_1.CanvasUtil.resolveImage(this, ctx, src);
        if (img instanceof forgescript_1.Return)
            return img;

        // Obtém os frames do encoder
        const frames = encoder.frames || [];
        if (frames.length === 0) {
            return this.customError('No frames available in GIF encoder');
        }

        // Determina quais frames processar
        const framesToProcess = frameIndex === -1 
            ? frames.map((_, index) => index)
            : [frameIndex];

        // Valida se o índice específico existe
        if (frameIndex !== -1 && (frameIndex < 0 || frameIndex >= frames.length)) {
            return this.customError(`Frame index ${frameIndex} out of range (0-${frames.length - 1})`);
        }

        try {
            for (const index of framesToProcess) {
                const frame = frames[index];
                
                // Cria um canvas temporário com as dimensões do frame
                const { createCanvas } = require('@napi-rs/canvas');
                const tempCanvas = createCanvas(frame.width || encoder.width, frame.height || encoder.height);
                const tempCtx = tempCanvas.getContext('2d');

                // Se o frame tem dados de imagem, desenha primeiro
                if (frame.data) {
                    const imageData = tempCtx.createImageData(tempCanvas.width, tempCanvas.height);
                    imageData.data.set(frame.data);
                    tempCtx.putImageData(imageData, 0, 0);
                }

                // Desenha a nova imagem sobre o frame
                await this.drawImageOnCanvas(tempCtx, img, x, y, width, height, radius);

                // Atualiza os dados do frame
                const updatedImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                frame.data = new Uint8Array(updatedImageData.data);
            }

            return this.success();
            
        } catch (error) {
            return this.customError(`Failed to draw image on GIF frames: ${error.message}`);
        }
    },

    // Método auxiliar para desenhar imagem no canvas
    async drawImageOnCanvas(ctx, img, x, y, width, height, radius) {
        const imgWidth = width || img.width;
        const imgHeight = height || img.height;

        if (radius && radius.length > 0) {
            // Desenha com bordas arredondadas
            ctx.save();
            this.createRoundedPath(ctx, x, y, imgWidth, imgHeight, radius);
            ctx.clip();
            ctx.drawImage(img, x, y, imgWidth, imgHeight);
            ctx.restore();
        } else {
            // Desenha normalmente
            ctx.drawImage(img, x, y, imgWidth, imgHeight);
        }
    },

    // Método auxiliar para criar path com bordas arredondadas
    createRoundedPath(ctx, x, y, width, height, radius) {
        const r = Array.isArray(radius) ? radius : [radius];
        const topLeft = r[0] || 0;
        const topRight = r[1] || topLeft;
        const bottomRight = r[2] || topLeft;
        const bottomLeft = r[3] || topRight;

        ctx.beginPath();
        ctx.moveTo(x + topLeft, y);
        ctx.lineTo(x + width - topRight, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + topRight);
        ctx.lineTo(x + width, y + height - bottomRight);
        ctx.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height);
        ctx.lineTo(x + bottomLeft, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
        ctx.lineTo(x, y + topLeft);
        ctx.quadraticCurveTo(x, y, x + topLeft, y);
        ctx.closePath();
    }
});
