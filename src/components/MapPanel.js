import { subscribe } from '../store/store.js'

export function MapPanel(root) {
	root.innerHTML = `
    <div class="map-static">
      <img id="mapImg" alt="City location map" crossorigin="anonymous"/>
      <button class="icon-btn expand" aria-label="Open on OpenStreetMap" title="Open map">↗</button>
    </div>
  `

	const img = root.querySelector('#mapImg')
	const btn = root.querySelector('.expand')

	const staticMap = (lat, lon, z = 11, w = 1000, h = 500) =>
		`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${z}&size=${w}x${h}&maptype=mapnik`

	function osmTile(lat, lon, z = 11) {
		const n = 2 ** z
		const xtile = Math.floor(((lon + 180) / 360) * n)
		const latRad = (lat * Math.PI) / 180
		const ytile = Math.floor(
			((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
				n
		)
		return `https://tile.openstreetmap.org/${z}/${xtile}/${ytile}.png`
	}

	subscribe(
		s => ({ loc: s.location }),
		({ loc }) => {
			if (!loc) return

			const { lat, lon } = loc

			img.removeAttribute('width')
			img.removeAttribute('height')
			img.style.width = '100%'
			img.style.height = '100%'
			img.style.objectFit = 'cover'

			const ZOOM = 10
			const dx = 0
			const dy = 0

			const { lat: latShifted, lon: lonShifted } = offsetByPixels(
				lat,
				lon,
				dx,
				dy,
				ZOOM
			)

			img.src = staticMap(latShifted, lonShifted, ZOOM)
			img.onerror = () => (img.src = osmTile(latShifted, lonShifted, ZOOM))

			btn.onclick = () =>
				window.open(
					`https://www.openstreetmap.org/#map=12/${lat}/${lon}`,
					'_blank'
				)
		}
	)

	function offsetByPixels(lat, lon, dx, dy, zoom) {
		const scale = 256 * Math.pow(2, zoom)

		const x = ((lon + 180) / 360) * scale
		const sinLat = Math.sin((lat * Math.PI) / 180)
		const y =
			(0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale

		const nx = x + dx
		const ny = y + dy

		const newLon = (nx / scale) * 360 - 180
		const n = Math.PI - (2 * Math.PI * ny) / scale
		const newLat =
			(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))

		return { lat: newLat, lon: newLon }
	}
}
