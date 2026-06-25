import { SavedAttribute } from "@sdk";

export function escapeXml(string: string) {
	return string.replace(/[<>&'"]/g, (c) => {
		switch (c) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&apos;";
			case '"':
				return "&quot;";
			default:
				return c;
		}
	});
}

export function createAttributeRecord(attributes: SavedAttribute[]) {
	const dictionary: Record<string, SavedAttribute[]> = {};

	for (const attribute of attributes) {
		if (attribute.key in dictionary) {
			dictionary[attribute.key]!.push(attribute);
		} else {
			dictionary[attribute.key] = [attribute];
		}
	}

	const output: Record<string, SavedAttribute> = {};
	for (const [key, list] of Object.entries(dictionary)) {
		const first = list.shift()!;
		const type = first.type;
		if (list.some((attribute) => attribute.type != type)) {
			throw new Error(
				`Attribute list contains multiple values of key "${key}" with different types`,
			);
		}

		for (const entry of list) {
			(first.values as any[]).push(...entry.values);
		}
		output[key] = first;
	}

	return output;
}

export function formatDuration(seconds: number) {
	let minutes = Math.floor(seconds / 60);
	seconds -= minutes * 60;
	const hours = Math.floor(minutes / 60);
	minutes -= hours * 60;

	return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toFixed(3)}`;
}
