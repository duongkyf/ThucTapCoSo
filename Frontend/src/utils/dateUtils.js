/**
 * Format ngày/giờ an toàn với múi giờ địa phương.
 * @param {string|Date} val 
 * @param {boolean} withTime 
 * @returns {string}
 */
export const fmtDate = (val, withTime = false) => {
  if (!val) return '—';
  let str = String(val).trim();

  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str = str.replace(' ', 'T');           
    if (str.length === 10) str += 'T00:00:00'; 
  }

  const d = new Date(str);
  if (isNaN(d)) return String(val);

  return withTime
    ? d.toLocaleString('vi-VN', {
        hour:   '2-digit',
        minute: '2-digit',
        day:    '2-digit',
        month:  '2-digit',
        year:   'numeric',
      })
    : d.toLocaleDateString('vi-VN');
};

/**
 * Lấy chuỗi ngày hôm nay theo múi giờ Việt Nam (UTC+7),
 * @returns {string}
 */
export const getTodayVN = () => {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vnNow.toISOString().split('T')[0];
};
