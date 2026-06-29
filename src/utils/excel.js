import * as XLSX from 'xlsx';

/**
 * Resizes and compresses an image file to a base64 string (max 300px width/height).
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 300;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Get base64 representation
        const dataUrl = canvas.toDataURL('image/png', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Helper to check if a string is a valid JSON.
 */
export const safeParseJSON = (str) => {
  if (typeof str !== 'string') return null;
  if (!str.startsWith('{') || !str.endsWith('}')) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

/**
 * Generates and downloads an Excel sheet from the list of questions.
 * @param {string} examName 
 * @param {Array} questions 
 */
export const generateExcel = (examName, questions) => {
  // Format questions into rows
  // Col A: Question, Col B: Option A, Col C: Option B, Col D: Option C, Col E: Option E (Wait! Prompt says Col E: Option D, Col F: Correct Answer)
  const headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'];
  
  const rows = questions.map((q) => {
    // Stringify questions and options if they have images or text
    const formatCell = (item) => {
      if (item.image) {
        return JSON.stringify({ text: item.text || '', image: item.image });
      }
      return item.text || '';
    };

    const qStr = formatCell(q.question);
    const aStr = formatCell(q.options[0]);
    const bStr = formatCell(q.options[1]);
    const cStr = formatCell(q.options[2]);
    const dStr = formatCell(q.options[3]);
    
    // Correct answer value is the same value of the answered option
    const correctOption = q.options[q.correctIndex];
    const correctStr = formatCell(correctOption);

    return [qStr, aStr, bStr, cStr, dStr, correctStr];
  });

  const sheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MCQ Questions');

  // Trigger download
  XLSX.writeFile(workbook, `${examName.replace(/[/\\?%*:|"<>]/g, '-') || 'exam'}.xlsx`);
};

/**
 * Parses an MCQ Excel file and extracts questions.
 * @param {File} file 
 * @returns {Promise<Array>}
 */
export const parseExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Raw rows format: AOA (Array of Arrays)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length < 2) {
          reject(new Error('Excel sheet must contain at least a header row and one question row.'));
          return;
        }

        // Parse each row starting from row index 1
        const questions = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row[0]) continue; // Skip empty rows

          const parseCell = (cellVal) => {
            if (!cellVal) return { text: '', image: '' };
            const strVal = String(cellVal).trim();
            const json = safeParseJSON(strVal);
            if (json) {
              return { text: json.text || '', image: json.image || '' };
            }
            return { text: strVal, image: '' };
          };

          const questionObj = parseCell(row[0]);
          const optA = parseCell(row[1]);
          const optB = parseCell(row[2]);
          const optC = parseCell(row[3]);
          const optD = parseCell(row[4]);
          
          const correctValStr = row[5] ? String(row[5]).trim() : '';

          const options = [optA, optB, optC, optD];
          
          // Find correct index
          // Compare both plain text or stringified cell matches
          let correctIndex = 0;
          let matched = false;
          
          for (let j = 0; j < options.length; j++) {
            const optValStr = rows[i][j + 1] ? String(rows[i][j + 1]).trim() : '';
            if (optValStr === correctValStr) {
              correctIndex = j;
              matched = true;
              break;
            }
          }
          
          // If we couldn't match by cell value directly, match by parsed text
          if (!matched) {
            const parsedCorrect = parseCell(correctValStr);
            for (let j = 0; j < options.length; j++) {
              if (options[j].text === parsedCorrect.text && options[j].image === parsedCorrect.image) {
                correctIndex = j;
                matched = true;
                break;
              }
            }
          }

          questions.push({
            question: questionObj,
            options,
            correctIndex
          });
        }

        resolve(questions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
