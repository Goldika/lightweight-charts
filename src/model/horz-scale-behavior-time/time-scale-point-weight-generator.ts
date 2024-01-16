import { Temporal } from '@js-temporal/polyfill';

import { Mutable } from '../../helpers/mutable';

import { InternalHorzScaleItem } from '../ihorz-scale-behavior';
import { TickMarkWeightValue, TimeScalePoint } from '../time-data';
import { TickMarkWeight, TimePoint } from './types';

function hours(count: number): number {
	return count * 60 * 60 * 1000;
}

function minutes(count: number): number {
	return count * 60 * 1000;
}

function seconds(count: number): number {
	return count * 1000;
}

interface WeightDivisor {
	divisor: number;
	weight: TickMarkWeight;
}

const intradayWeightDivisors: WeightDivisor[] = [
	{ divisor: seconds(1), weight: TickMarkWeight.Second },
	{ divisor: minutes(1), weight: TickMarkWeight.Minute1 },
	{ divisor: minutes(5), weight: TickMarkWeight.Minute5 },
	{ divisor: minutes(30), weight: TickMarkWeight.Minute30 },
	{ divisor: hours(1), weight: TickMarkWeight.Hour1 },
	{ divisor: hours(3), weight: TickMarkWeight.Hour3 },
	{ divisor: hours(6), weight: TickMarkWeight.Hour6 },
	{ divisor: hours(12), weight: TickMarkWeight.Hour12 },
];

const aSecond = 1000;
const aMinute = 60 * aSecond;
const anHour = 60 * aMinute;
const aDay = 24 * anHour;

const thisMonth = Temporal.Now.zonedDateTime('persian', 'Asia/Tehran').with({
	day: 1,
	hour: 0,
	minute: 0,
	second: 0,
	millisecond: 0,
	microsecond: 0,
	nanosecond: 0,
});

const getMonthData = (d: Temporal.ZonedDateTime) => {
	return {
		value: d.epochMilliseconds,
		month: d.month,
		year: d.year,
	};
};

const monthStarts = {
	front: thisMonth,
	back: thisMonth,
	values: [getMonthData(thisMonth)],
};

function expandMonthStarts(count: number): void {
	if (count < 0) {
		for (let i = 0; i < -count; i += 1) {
			monthStarts.back = monthStarts.back.add({ months: -1 });
			monthStarts.values.splice(0, 0, getMonthData(monthStarts.back));
		}
	} else {
		for (let i = 0; i < count; i += 1) {
			monthStarts.front = monthStarts.front.add({ months: 1 });
			monthStarts.values.push(getMonthData(monthStarts.front));
		}
	}
}

expandMonthStarts(6);
expandMonthStarts(-60);

function getMonthStart(v: number): ReturnType<typeof getMonthData> {
	while (v < monthStarts.values[0].value) {
		expandMonthStarts(-12);
	}
	while (monthStarts.values[monthStarts.values.length - 1].value < v) {
		expandMonthStarts(12);
	}

	let a = 0;
	let b = monthStarts.values.length;
	while (b - a > 1) {
		const c = a + Math.floor((b - a) / 2);
		if (v < monthStarts.values[c].value) {
			b = c;
		} else {
			a = c;
		}
	}

	return monthStarts.values[a];
}

function weightByTime(currentDate: Date, prevDate: Date): TickMarkWeight {
	const currentValue = currentDate.valueOf();
	const prevValue = prevDate.valueOf();
	const currentMonth = getMonthStart(currentValue);
	const prevMonth = getMonthStart(prevValue);
	const currentDay = Math.floor((currentValue - currentMonth.value) / aDay);
	const prevDay = Math.floor((prevValue - prevMonth.value) / aDay);

	if (currentMonth.year !== prevMonth.year) {
		return TickMarkWeight.Year;
	} else if (currentMonth.month !== prevMonth.month) {
		return TickMarkWeight.Month;
	} else if (currentDay !== prevDay) {
		return TickMarkWeight.Day;
	}

	for (let i = intradayWeightDivisors.length - 1; i >= 0; --i) {
		if (Math.floor(prevDate.getTime() / intradayWeightDivisors[i].divisor) !== Math.floor(currentDate.getTime() / intradayWeightDivisors[i].divisor)) {
			return intradayWeightDivisors[i].weight;
		}
	}

	return TickMarkWeight.LessThanSecond;
}

function cast(t: InternalHorzScaleItem): TimePoint {
	return t as unknown as TimePoint;
}

export function fillWeightsForPoints(sortedTimePoints: readonly Mutable<TimeScalePoint>[], startIndex: number = 0): void {
	if (sortedTimePoints.length === 0) {
		return;
	}

	let prevTime = startIndex === 0 ? null : cast(sortedTimePoints[startIndex - 1].time).timestamp;
	let prevDate = prevTime !== null ? new Date(prevTime * 1000) : null;

	let totalTimeDiff = 0;

	for (let index = startIndex; index < sortedTimePoints.length; ++index) {
		const currentPoint = sortedTimePoints[index];
		const currentDate = new Date(cast(currentPoint.time).timestamp * 1000);

		if (prevDate !== null) {
			currentPoint.timeWeight = weightByTime(currentDate, prevDate) as TickMarkWeightValue;
		}

		totalTimeDiff += cast(currentPoint.time).timestamp - (prevTime || cast(currentPoint.time).timestamp);

		prevTime = cast(currentPoint.time).timestamp;
		prevDate = currentDate;
	}

	if (startIndex === 0 && sortedTimePoints.length > 1) {
		// let's guess a weight for the first point
		// let's say the previous point was average time back in the history
		const averageTimeDiff = Math.ceil(totalTimeDiff / (sortedTimePoints.length - 1));
		const approxPrevDate = new Date((cast(sortedTimePoints[0].time).timestamp - averageTimeDiff) * 1000);
		sortedTimePoints[0].timeWeight = weightByTime(new Date(cast(sortedTimePoints[0].time).timestamp * 1000), approxPrevDate) as TickMarkWeightValue;
	}
}
