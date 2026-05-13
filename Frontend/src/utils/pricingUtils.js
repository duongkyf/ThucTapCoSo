export const TAX_RATE      = 1.1;   // 10% thuế / phí dịch vụ
export const CHILD_RATIO   = 0.8;   // trẻ em giảm 20%
export const INFANT_RATIO  = 0;     // em bé miễn phí

/**
 * Giá 1 vé theo loại hành khách.
 * @param {number} basePrice 
 * @param {'adult'|'child'|'infant'} type
 * @returns {number}
 */
export const calcTicketPrice = (basePrice, type) => {
  const ratio = type === 'child'  ? CHILD_RATIO
              : type === 'infant' ? INFANT_RATIO
              : 1;
  return Math.round(Number(basePrice) * ratio * TAX_RATE);
};

/**
 * Tổng tiền vé 1 chiều bay (chưa cộng dịch vụ).
 * @param {number} basePrice
 * @param {{ adult: number, child: number, infant: number }} pax
 * @returns {number}
 */
export const calcFlightTotal = (basePrice, pax = {}) =>
  calcTicketPrice(basePrice, 'adult')  * (pax.adult  || 1) +
  calcTicketPrice(basePrice, 'child')  * (pax.child  || 0) +
  calcTicketPrice(basePrice, 'infant') * (pax.infant || 0);

/**
 * Tổng tiền dịch vụ bổ sung 1 chiều.
 * @param {{ baggage?: object, oversized?: object, meal?: object }} services
 * @returns {number}
 */
const sumObj = (obj = {}) => Object.values(obj).reduce((a, b) => a + Number(b), 0);

export const calcServiceTotal = (services = {}) =>
  sumObj(services.baggage) + sumObj(services.oversized) + sumObj(services.meal);
