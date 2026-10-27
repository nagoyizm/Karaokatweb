# Karaokatweb

Landing de **Karaokat Studio**: la página es una canción.

Ábrela con un servidor local (los módulos JS no cargan con doble clic):

    cd Karaokatweb
    python -m http.server 8000      → http://localhost:8000


## La idea
- **La página es una canción.** Las secciones son Intro, Verso 1, Estribillo, Verso 2, Puente, Coro y Outro. La barra de abajo es la línea de tiempo (de 00:00 a 03:30) y también el menú: cada tramo lleva a su sección.
- **Los títulos se cantan.** Cada sílaba se pinta de cian mientras bajas, con una pelotita cian que salta de sílaba en sílaba (como el efecto Bolita). Al terminar la línea vuelve a blanco.
- **El hero es un demo automático.** Sobre un fondo de video cualquiera (`assets/img/fondo-demo.webp`, generado, sin derechos de terceros), la letra pasa en carrusel vertical y cada línea se canta con un efecto distinto.
- **El puente es Calibrar de verdad.** La palabra amarilla llega tarde y se arrastra hasta la marca (también funciona con las flechas del teclado).

## Decisiones de diseño
- Fuentes: Dela Gothic One (títulos y letras, la gótica de las pantallas de karaoke japonesas), Black Han Sans (coreano), Atkinson Hyperlegible Next (texto) y JetBrains Mono (solo para tiempos).
- Los colores tienen papel: blanco = por cantar, cian = suena ahora, magenta = segunda línea (romanización), amarillo = aviso del editor. Se quitaron el índigo, el violeta y el verde.
- El vidrio solo está donde hay capas reales: la barra de la canción y el panel de letra sobre el video.
- Se quitaron las etiquetas sobre los títulos, las filas de 3 tarjetas, los números 01–04, las ventanas falsas de Mac, los brillos decorativos, el degradado del nombre y la animación con rebote de la interfaz. El rebote se queda solo en el efecto Pop, porque así se ve en el video.

## Por completar antes de publicar
- `DOWNLOAD_URL` y `WAITLIST_ENDPOINT` al inicio de `js/main.js`.
- Correo de contacto (`hola@karaokat.app` es provisorio) y páginas de Términos y Privacidad.
- Precios: los del brief (propuesta).
- La pista de la demo y todas las letras son originales (sin derechos de terceros).
