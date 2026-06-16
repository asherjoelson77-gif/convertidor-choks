const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const ytDlpWrap = new YTDlpWrap();

// Almacén temporal para las descargas recientes en memoria
let descargasRecientes = [];

app.use(express.json());
app.use(express.static(__dirname));

// Servir la interfaz web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Obtener el historial de descargas recientes
app.get('/recientes', (req, res) => {
    res.json(descargasRecientes);
});

// Ruta para analizar el video y obtener la vista previa
app.post('/analizar', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Por favor, proporciona una URL válida.' });
    }

    try {
        const videoInfo = await ytDlpWrap.getVideoInfo(url);
        
        // Extraer datos clave para la vista previa
        res.json({
            title: videoInfo.title,
            duration: videoInfo.duration_string || 'Desconocida',
            uploader: videoInfo.uploader || 'Canal Desconocido',
            thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/480x360?text=Sin+Miniatura',
            url: url
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo obtener información del video. Verifica el enlace.' });
    }
});

// Ruta definitiva para procesar la conversión y descarga
app.post('/convertir', async (req, res) => {
    const { url } = req.body;

    try {
        const videoInfo = await ytDlpWrap.getVideoInfo(url);
        const safeTitle = videoInfo.title.replace(/[/\\?%*:|"<>]/g, '-');
        const outputFilename = `${safeTitle}.mp3`;
        const outputPath = path.join(__dirname, outputFilename);

        await ytDlpWrap.execPromise([
            url,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', outputPath
        ]);

        if (fs.existsSync(outputPath)) {
            // Añadir al inicio de la lista de recientes
            const nuevaDescarga = {
                id: Date.now(),
                title: videoInfo.title,
                uploader: videoInfo.uploader || 'Canal Desconocido',
                thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/120?text=MP3'
            };
            
            descargasRecientes.unshift(nuevaDescarga);
            if (descargasRecientes.length > 5) descargasRecientes.pop(); // Limitar a las últimas 5

            res.download(outputPath, outputFilename, (err) => {
                if (err) console.error('Error al enviar archivo:', err);
                try {
                    fs.unlinkSync(outputPath);
                } catch (e) {}
            });
        } else {
            res.status(500).json({ error: 'No se pudo generar el archivo MP3.' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error durante la conversión.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

