/**
 * Fields below are declared explicitly rather than as constructor parameter
 * properties: those are unsupported by Node's type-stripping loader
 * (`--experimental-strip-types`), and would break anyone running the .ts
 * sources directly.
 */

/** Base for every error this library throws, so callers can catch one type. */
export class RailError extends Error {
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = new.target.name;
		this.code = code;
	}
}

/** Input the caller can fix — unknown station, malformed train number. */
export class InvalidInputError extends RailError {
	constructor(message: string) {
		super(message, "INVALID_INPUT");
	}
}

/**
 * NTES answered, but with one of its `ERR<nnn>` pages.
 *
 * Deliberately NOT described as "service unavailable": NTES returns the very
 * same ERR000 page for malformed input as it does for a real outage, so the
 * message has to stay honest about both possibilities. Station codes are
 * validated against the catalogue before we get here precisely so this is
 * rarely our own fault.
 */
export class NtesError extends RailError {
	readonly ntesCode: string;
	readonly detail: string | undefined;

	constructor(ntesCode: string, detail?: string) {
		super(
			`NTES returned ${ntesCode}. This means either the enquiry service is ` +
				`temporarily down, or the request was rejected. Try again shortly; ` +
				`if it persists, check the train/station values.` +
				(detail ? ` NTES said: ${detail}` : ""),
			"NTES_ERROR"
		);
		this.ntesCode = ntesCode;
		this.detail = detail;
	}
}

/** IRCTC answered with an `errorMessage` in an otherwise HTTP 200 body. */
export class IrctcError extends RailError {
	constructor(message: string) {
		super(message, "IRCTC_ERROR");
	}
}

/** The upstream did not answer at all, or answered unparseably. */
export class UpstreamError extends RailError {
	constructor(message: string) {
		super(message, "UPSTREAM_ERROR");
	}
}
