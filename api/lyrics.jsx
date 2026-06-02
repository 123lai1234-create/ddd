import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// MaxKey 中國版 Whisper API 端點
const WHISPER_API_URL = 'https://ai.maxkey.cn/v1/audio/transcriptions';

export default async function handler(req, res) {
  // 設置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支援 POST 請求' });
  }
  
  try {
    // 獲取 API Key
    const apiKey = process.env.MAXKEY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '未設定 MAXKEY_API_KEY 環境變數' });
    }
    
    // 處理 FormData
    const formData = req.body;
    
    // 確保是 FormData 格式
    if (!(formData instanceof FormData) && !formData.get) {
      return res.status(400).json({ error: '需要上傳音頻檔案 (FormData)' });
    }
    
    // 獲取音頻檔案
    const audioFile = formData.get('file');
    if (!audioFile) {
      return res.status(400).json({ error: '請上傳音頻檔案' });
    }
    
    // 準備 Whisper API 請求
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile);
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('response_format', 'verbose_json');
    whisperFormData.append('timestamp_granularities[]', 'word');
    whisperFormData.append('language', 'zh');
    
    // 調用 Whisper API
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperFormData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API Error:', errorText);
      return res.status(response.status).json({ 
        error: '語音辨識失敗', 
        details: errorText 
      });
    }
    
    const result = await response.json();
    
    // 轉換為 LRC 格式歌詞
    const lyrics = convertToLRC(result);
    
    return res.status(200).json({
      success: true,
      text: result.text,
      language: result.language,
      duration: result.duration,
      lyrics: lyrics,
      words: result.words || []
    });
    
  } catch (error) {
    console.error('Lyrics API Error:', error);
    return res.status(500).json({ 
      error: '伺服器錯誤', 
      message: error.message 
    });
  }
}

// 將 Whisper 結果轉換為 LRC 格式
function convertToLRC(result) {
  const lines = [];
  
  if (result.words && result.words.length > 0) {
    // 按句子分組（根據停頓）
    let currentLine = { words: [], start: null, end: null };
    const pauseThreshold = 0.8; // 超過 0.8 秒視為句子分隔
    
    for (const word of result.words) {
      const wordStart = word.start;
      const wordEnd = word.end;
      
      // 檢查是否需要換行
      if (currentLine.start !== null) {
        const gap = wordStart - currentLine.end;
        if (gap > pauseThreshold && currentLine.words.length > 0) {
          // 完成當前行
          const text = currentLine.words.map(w => w.word).join('');
          if (text.trim()) {
            lines.push({
              time: currentLine.start,
              text: text.trim()
            });
          }
          // 開始新行
          currentLine = { words: [], start: wordStart, end: wordEnd };
          currentLine.words.push({ word: word.word, start: wordStart, end: wordEnd });
        } else {
          // 添加到當前行
          currentLine.words.push({ word: word.word, start: wordStart, end: wordEnd });
          currentLine.end = wordEnd;
        }
      } else {
        currentLine = { words: [], start: wordStart, end: wordEnd };
        currentLine.words.push({ word: word.word, start: wordStart, end: wordEnd });
      }
    }
    
    // 添加最後一行
    if (currentLine.words.length > 0) {
      const text = currentLine.words.map(w => w.word).join('');
      if (text.trim()) {
        lines.push({
          time: currentLine.start,
          text: text.trim()
        });
      }
    }
  } else if (result.text) {
    // 如果沒有 word-level 數據，按大意分段
    const sentences = result.text.split(/[。！？，、]/).filter(s => s.trim());
    const duration = result.duration || 60;
    const timePerSentence = duration / (sentences.length + 1);
    
    sentences.forEach((sentence, i) => {
      if (sentence.trim()) {
        lines.push({
          time: timePerSentence * (i + 1),
          text: sentence.trim()
        });
      }
    });
  }
  
  // 生成 LRC 格式
  return lines.map(line => {
    const minutes = Math.floor(line.time / 60);
    const seconds = (line.time % 60).toFixed(2);
    return `[${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}]${line.text}`;
  }).join('\n');
}

// 禁用 Vercel 預處理
export const config = {
  api: {
    bodyParser: false,
  },
};