/** A station as published in NTES's own station catalogue. */
export interface Station {
	code: string;
	name: string;
}

/** A train as published in NTES's own train catalogue. */
export interface TrainSummary {
	number: string;
	name: string;
}

/** One stop on a train's scheduled route. */
export interface RouteStop {
	position: number;
	stationName: string;
	stationCode: string;
	day: number | null;
	arrival: string | null;
	departure: string | null;
	haltMinutes: number | null;
	distanceKm: number | null;
}

export interface TrainInfo {
	trainNumber: string;
	trainName: string;
	fromStationName: string | null;
	toStationName: string | null;
	travelTime: string | null;
	runsOn: string | null;
	type: string | null;
	classes: string[];
	route: RouteStop[];
}

/** One selectable journey date for a train, from the running-status form. */
export interface JourneyInstance {
	/** Raw label as NTES renders it, e.g. "27-Aug (17:00)". */
	label: string;
	/** Normalised DD-MMM-YYYY, when derivable. */
	date: string | null;
}

export interface RunningStop {
	stationName: string;
	stationCode: string;
	scheduledArrival: string | null;
	actualArrival: string | null;
	scheduledDeparture: string | null;
	actualDeparture: string | null;
	delay: string | null;
	platform: string | null;
}

export interface CoachSlot {
	position: number;
	coach: string;
	classCode: string;
}

export interface TrainRunning {
	trainNumber: string;
	trainName: string | null;
	journeyDate: string | null;
	summary: string | null;
	availableInstances: JourneyInstance[];
	stops: RunningStop[];
	coachPosition: CoachSlot[];
}

export interface TrainBetweenStations {
	trainNumber: string;
	trainName: string;
	runsOn: string | null;
	type: string | null;
	fromStationName: string | null;
	fromStationCode: string | null;
	toStationName: string | null;
	toStationCode: string | null;
	departure: string | null;
	arrival: string | null;
	duration: string | null;
}

export interface LiveStationTrain {
	trainNumber: string;
	trainName: string;
	route: string | null;
	classes: string[];
	scheduledArrival: string | null;
	actualArrival: string | null;
	scheduledDeparture: string | null;
	actualDeparture: string | null;
	delay: string | null;
	platform: string | null;
}

export interface LiveStationBoard {
	stationCode: string;
	stationName: string | null;
	windowHours: number;
	trains: LiveStationTrain[];
}

/** One coach's vacancy summary, from IRCTC's chart service. */
export interface CoachVacancy {
	coachName: string;
	classCode: string;
	positionFromEngine: number;
	vacantBerths: number;
}

/** One individually vacant berth, from IRCTC's chart service. */
export interface VacantBerth {
	coachName: string;
	berthNumber: number;
	/** L / M / U / R / S — lower, middle, upper, side-lower, side-upper. */
	berthCode: string;
	cabinCoupeNo: string | null;
	from: string;
	to: string;
}

export interface SeatAvailability {
	trainNumber: string;
	trainName: string | null;
	from: string | null;
	to: string | null;
	journeyDate: string | null;
	boardingStation: string;
	/** NTES/IRCTC "remote location" the chart was prepared at. */
	remote: string | null;
	chartPrepared: boolean;
	chartPreparedAt: string | null;
	coaches: CoachVacancy[];
	/** Populated only when a travel class is requested and the chart is out. */
	vacantBerths: VacantBerth[];
	totalVacant: number;
}
