"use strict";

/** @typedef {'debug'|'info'|'warn'|'error'|'fatal'|'silent'} LogLevel */
/** @typedef {Record<string, unknown>} Fields */
/** @typedef {{log:(value:string)=>void,warn:(value:string)=>void,error:(value:string)=>void}} LogOutput */
/** @typedef {{debug:(event:string,fields?:Fields)=>void,info:(event:string,fields?:Fields)=>void,warn:(event:string,fields?:Fields)=>void,error:(event:string,fields?:Fields)=>void,fatal:(event:string,fields?:Fields)=>void,child:(fields?:Fields)=>Logger}} Logger */

/** @type {Record<LogLevel, number>} */
const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
  silent: 100,
};

/** @param {unknown} error @returns {Fields} */
function errorFields(error) {
  if (!(error instanceof Error)) return { error: String(error) };
  const codedError = /** @type {Error & {code?:unknown}} */ (error);
  return {
    error: error.message,
    errorName: error.name,
    errorCode:
      typeof codedError.code === "string" ? codedError.code : undefined,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  };
}

/** @param {{service?:string,version?:string,level?:LogLevel,output?:LogOutput}} [options] @returns {Logger} */
function createLogger({
  service = "northstar-msp-portal",
  version = "1.0.0",
  level = /** @type {LogLevel} */ (process.env.LOG_LEVEL || "info"),
  output = console,
} = {}) {
  const threshold = LEVELS[level];
  if (threshold === undefined)
    throw new Error(`Unsupported LOG_LEVEL: ${level}`);
  /** @param {LogLevel} logLevel @param {string} event @param {Fields} [fields] */
  function write(logLevel, event, fields = {}) {
    if (LEVELS[logLevel] < threshold) return;
    const payload = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      service,
      version,
      event,
      ...fields,
    };
    const line = JSON.stringify(payload, (_key, value) =>
      value === undefined ? undefined : value,
    );
    const method =
      logLevel === "debug" || logLevel === "info"
        ? "log"
        : logLevel === "warn"
          ? "warn"
          : "error";
    output[method](line);
  }
  /** @param {Fields} [baseFields] @returns {Logger} */
  function scoped(baseFields = {}) {
    return {
      debug: (event, fields) =>
        write("debug", event, { ...baseFields, ...fields }),
      info: (event, fields) =>
        write("info", event, { ...baseFields, ...fields }),
      warn: (event, fields) =>
        write("warn", event, { ...baseFields, ...fields }),
      error: (event, fields) =>
        write("error", event, { ...baseFields, ...fields }),
      fatal: (event, fields) =>
        write("fatal", event, { ...baseFields, ...fields }),
      child: (fields = {}) => scoped({ ...baseFields, ...fields }),
    };
  }
  return scoped();
}

module.exports = { createLogger, errorFields, LEVELS };
