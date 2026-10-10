import { Injectable } from '@nestjs/common';

@Injectable()
export class NormalizationService {
  normalizeTranscript<T = Record<string, unknown>>(data: T): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const copy = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

    // 1. Normalize student
    if (copy.student && typeof copy.student === 'object') {
      const s = this.normalizeStrings(copy.student as Record<string, unknown>);
      if (typeof s.birthdate === 'string') {
        s.birthdate = this.normalizeDate(s.birthdate);
      }
      copy.student = s;
    }

    // 2. Normalize institution
    if (copy.institution && typeof copy.institution === 'object') {
      copy.institution = this.normalizeStrings(copy.institution as Record<string, unknown>);
    }

    // 3. Normalize program
    if (copy.program && typeof copy.program === 'object') {
      const prog = this.normalizeStrings(copy.program as Record<string, unknown>);
      if (!prog.department && typeof prog.school === 'string' && /Department\s+of/i.test(prog.school)) {
        prog.department = prog.school.replace(/Department\s+of\s+/i, '').trim();
      }
      copy.program = prog;
    }

    // 3b. Normalize degree information
    if (copy.degree_information && typeof copy.degree_information === 'object') {
      const deg = this.normalizeStrings(copy.degree_information as Record<string, unknown>);
      if (typeof deg.conferral_date === 'string') {
        deg.conferral_date = this.normalizeDate(deg.conferral_date);
      }
      copy.degree_information = deg;
    }

    // 4. Normalize academic records
    if (Array.isArray(copy.academic_records)) {
      copy.academic_records = copy.academic_records.map((rec) => {
        if (!rec || typeof rec !== 'object') return rec;
        const r = this.normalizeStrings(rec as Record<string, unknown>);

        // Normalize credits to number if string representation of float/int
        if (r.credits !== null && r.credits !== undefined) {
          if (typeof r.credits === 'string') {
            const parsed = parseFloat(r.credits);
            if (!isNaN(parsed) && isFinite(parsed)) {
              r.credits = parsed;
            }
          }
        }

        // Clean course code
        if (typeof r.course_code === 'string') {
          r.course_code = r.course_code.trim();
        }

        return r;
      });
    }

    // 5. Normalize academic summary
    if (copy.academic_summary && typeof copy.academic_summary === 'object') {
      const summary = copy.academic_summary as Record<string, unknown>;
      ['cumulative_gpa', 'term_gpa', 'total_credits_attempted', 'total_credits_earned'].forEach(
        (key) => {
          if (typeof summary[key] === 'string') {
            const parsed = parseFloat(summary[key] as string);
            if (!isNaN(parsed) && isFinite(parsed)) {
              summary[key] = parsed;
            }
          }
        },
      );
    }

    return copy as unknown as T;
  }

  private normalizeStrings(obj: Record<string, unknown>): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        const trimmed = v.trim();
        res[k] = trimmed.length === 0 ? null : trimmed;
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        res[k] = this.normalizeStrings(v as Record<string, unknown>);
      } else {
        res[k] = v;
      }
    }
    return res;
  }

  normalizeDate(raw: string): string {
    if (!raw || typeof raw !== 'string') return raw;
    let cur = raw.trim();
    // Strip label prefixes
    cur = cur.replace(/^(?:BIRTHDATE|DATE OF BIRTH|DOB|CONFERRAL DATE|DATE CONFERRED|GRADUATION DATE|AWARD DATE|DATE)\s*[:=\-~.]?\s*/i, '').trim();

    const monthMap: Record<string, string> = {
      JAN: 'Jan', JANUARY: 'Jan', '01': 'Jan', '1': 'Jan',
      FEB: 'Feb', FEBRUARY: 'Feb', '02': 'Feb', '2': 'Feb',
      MAR: 'Mar', MARCH: 'Mar', '03': 'Mar', '3': 'Mar',
      APR: 'Apr', APRIL: 'Apr', '04': 'Apr', '4': 'Apr',
      MAY: 'May', '05': 'May', '5': 'May',
      JUN: 'Jun', JUNE: 'Jun', '06': 'Jun', '6': 'Jun',
      JUL: 'Jul', JULY: 'Jul', '07': 'Jul', '7': 'Jul',
      AUG: 'Aug', AUGUST: 'Aug', '08': 'Aug', '8': 'Aug',
      SEP: 'Sep', SEPT: 'Sep', SEPTEMBER: 'Sep', '09': 'Sep', '9': 'Sep',
      OCT: 'Oct', OCTOBER: 'Oct', '10': 'Oct',
      NOV: 'Nov', NOVEMBER: 'Nov', '11': 'Nov',
      DEC: 'Dec', DECEMBER: 'Dec', '12': 'Dec'
    };

    // Pattern 1: Merged month name + day + 4-digit year (e.g. Jun 261997, June 261997)
    const merged = cur.match(/^([A-Za-z]{3,9})\.?\s*([0-9]{1,2})([12][0-9]{3})$/);
    if (merged) {
      const m = monthMap[merged[1].toUpperCase()];
      if (m) return `${m} ${parseInt(merged[2], 10)} ${merged[3]}`;
    }

    // Pattern 2: Text date (e.g. Jun 26 1997, June 26, 1997)
    const textDate = cur.match(/^([A-Za-z]{3,9})\.?\s+([0-9]{1,2})(?:st|nd|rd|th)?[\s,]+([12][0-9]{3})$/);
    if (textDate) {
      const m = monthMap[textDate[1].toUpperCase()];
      if (m) return `${m} ${parseInt(textDate[2], 10)} ${textDate[3]}`;
    }

    // Pattern 3: DMY (e.g. 26 Jun 1997)
    const dmy = cur.match(/^([0-9]{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?[\s,]+([12][0-9]{3})$/);
    if (dmy) {
      const m = monthMap[dmy[2].toUpperCase()];
      if (m) return `${m} ${parseInt(dmy[1], 10)} ${dmy[3]}`;
    }

    // Pattern 4: Numeric MM/DD/YYYY or MM-DD-YYYY
    const numeric = cur.match(/^([0-9]{1,2})[/\-.]([0-9]{1,2})[/\-.]([12][0-9]{3})$/);
    if (numeric) {
      const m = monthMap[parseInt(numeric[1], 10).toString()];
      if (m) return `${m} ${parseInt(numeric[2], 10)} ${numeric[3]}`;
    }

    // Pattern 5: ISO YYYY-MM-DD
    const iso = cur.match(/^([12][0-9]{3})[/\-.]([0-9]{1,2})[/\-.]([0-9]{1,2})$/);
    if (iso) {
      const m = monthMap[parseInt(iso[2], 10).toString()];
      if (m) return `${m} ${parseInt(iso[3], 10)} ${iso[1]}`;
    }

    return cur;
  }
}

