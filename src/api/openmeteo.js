import { fetchJSON } from './http.js'

export async function geocode(q, opts = {}) {
	if (!q) return []
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
		q
	)}&count=5&language=en`
	const data = await fetchJSON(url, { signal: opts.signal })
	return (data.results || []).map(r => ({
		name: r.name,
		country: r.country,
		lat: r.latitude,
		lon: r.longitude,
		tz: r.timezone,
	}))
}

const ym = iso => iso.slice(0, 7)
const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

export async function getWeather({ lat, lon }) {
	const p1 = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		timezone: 'auto',
		temperature_unit: 'celsius',
		windspeed_unit: 'kmh',
		precipitation_unit: 'mm',
		current_weather: 'true',
		timeformat: 'iso8601',
		past_days: '3',
	})
	p1.append(
		'hourly',
		[
			'temperature_2m',
			'relativehumidity_2m',
			'precipitation',
			'pressure_msl',
			'weathercode',
		].join(',')
	)
	p1.append(
		'daily',
		[
			'weathercode',
			'temperature_2m_max',
			'temperature_2m_min',
			'precipitation_sum',
			'uv_index_max',
		].join(',')
	)
	const forecastURL = `https://api.open-meteo.com/v1/forecast?${p1.toString()}`

	const end = new Date()
	end.setDate(end.getDate() - 1)
	const start = new Date(end)
	start.setFullYear(end.getFullYear() - 1)
	const sd = start.toISOString().slice(0, 10)
	const ed = end.toISOString().slice(0, 10)
	const p2 = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		timezone: 'auto',
		timeformat: 'iso8601',
		start_date: sd,
		end_date: ed,
	})
	p2.append(
		'hourly',
		['relativehumidity_2m', 'pressure_msl', 'precipitation'].join(',')
	)
	p2.append('daily', ['uv_index_max'].join(','))
	const archiveURL = `https://archive-api.open-meteo.com/v1/archive?${p2.toString()}`

	const [fj, aj] = await Promise.all([
		fetchJSON(forecastURL),
		fetchJSON(archiveURL),
	])

	const Ht = fj.hourly?.time || []
	const H = {
		t: fj.hourly?.temperature_2m || [],
		h: fj.hourly?.relativehumidity_2m || [],
		r: fj.hourly?.precipitation || [],
		p: fj.hourly?.pressure_msl || [],
		c: fj.hourly?.weathercode || [],
	}
	const curIso = fj.current_weather?.time
	let curIdx = Ht.findIndex(t => t === curIso)
	if (curIdx < 0) curIdx = 0

	const hourly24 = Array.from({ length: 24 }, (_, k) => curIdx + k)
		.filter(i => i < Ht.length)
		.map(i => ({
			ts: Ht[i],
			temp: H.t[i],
			humidity: H.h[i],
			precip: H.r[i],
			pressure: H.p[i],
			code: H.c[i],
		}))

	const current = {
		temp: fj.current_weather?.temperature ?? null,
		wind: fj.current_weather?.windspeed ?? null,
		code: fj.current_weather?.weathercode ?? null,
		humidity: Number.isFinite(H.h[curIdx]) ? H.h[curIdx] : null,
	}

	const todayISO = new Date().toISOString().slice(0, 10)
	const Dt = fj.daily?.time || []
	const dailyAll = Dt.map((d, i) => ({
		date: d,
		max: fj.daily.temperature_2m_max?.[i],
		min: fj.daily.temperature_2m_min?.[i],
		code: fj.daily.weathercode?.[i],
		precip: fj.daily.precipitation_sum?.[i] ?? 0,
		uvmax: fj.daily.uv_index_max?.[i] ?? 0,
	}))
	const daily = dailyAll.filter(d => d.date >= todayISO).slice(0, 7)

	const At = aj.hourly?.time || []
	const Ah = {
		h: aj.hourly?.relativehumidity_2m || [],
		p: aj.hourly?.pressure_msl || [],
		r: aj.hourly?.precipitation || [],
	}
	const bucket = new Map()
	// hourly
	for (let i = 0; i < At.length; i++) {
		const k = ym(At[i])
		let b = bucket.get(k)
		if (!b) {
			b = { H: [], P: [], Rsum: 0, UVmax: 0 }
			bucket.set(k, b)
		}
		const hv = Ah.h[i],
			pv = Ah.p[i],
			rv = Ah.r[i]
		if (Number.isFinite(hv)) b.H.push(hv)
		if (Number.isFinite(pv)) b.P.push(pv)
		if (Number.isFinite(rv)) b.Rsum += rv
	}
	// uv daily
	const ADt = aj.daily?.time || []
	const Auv = aj.daily?.uv_index_max || []
	for (let i = 0; i < ADt.length; i++) {
		const k = ym(ADt[i])
		let b = bucket.get(k)
		if (!b) {
			b = { H: [], P: [], Rsum: 0, UVmax: 0 }
			bucket.set(k, b)
		}
		b.UVmax = Math.max(b.UVmax, Number(Auv?.[i] || 0))
	}

	const months = Array.from(bucket.keys()).sort().slice(-12)
	const series = {
		months,
		humidity: months.map(k => {
			const v = avg(bucket.get(k).H)
			return v == null ? null : Math.round(v)
		}),
		pressure: months.map(k => {
			const v = avg(bucket.get(k).P)
			return v == null ? null : Math.round(v)
		}),
		rain: months.map(k => Math.round(bucket.get(k).Rsum)),
		uv: months.map(k => Math.round(bucket.get(k).UVmax)),
	}

	return {
		current,
		hourly: hourly24,
		daily,
		series,
		fetchedAt: new Date().toISOString(),
	}
}
