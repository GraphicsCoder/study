/* 四年级上（五·四学制）英语 4A 预习单词库
 *
 * 数据来自学校发的《4A 预习单》PDF（10 个 unit，共 221 条），
 * 一条就是预习单上的一行：单词或词组 + 词性 + 中文。
 *
 *   w  英文（单词或词组，原样保留大小写和空格）
 *   p  词性：n./v./adj./adv. 等；词组留空字符串
 *   c  中文释义（预习单上怎么写就怎么抄，分号也照抄）
 *
 * 词组和单词混在一张表里，但 p 为空就是词组——出题时要分开用：
 * 单词可以拼写、可以听音；词组只适合做中译英、英译中和填句子。
 *
 * 浏览器里挂到 window.词库4A，node 里用 module.exports，同一份数据。
 */
(function (root) {
  "use strict";

  var UNITS = [
    { u: 1, title: "Our school", words: [
      ["classroom", "n.", "教室"],
      ["hall", "n.", "礼堂"],
      ["begin", "v.", "开始"],
      ["project", "n.", "学校的课题"],
      ["let", "v.", "允许；让"],
      ["bamboo", "n.", "竹子"],
      ["tall", "adj.", "高大的"],
      ["student", "n.", "学生"],
      ["library", "n.", "图书馆"],
      ["keep ... tidy", "", "保持……整洁"],
      ["sports field", "", "运动场"],
      ["computer room", "", "计算机机房"],
      ["school building", "", "教学楼"],
      ["art room", "", "美术教室"],
      ["reading room", "", "阅览室"],
      ["do sports", "", "做运动"],
      ["look for", "", "寻找"],
      ["ground floor", "", "一楼；底楼"],
      ["be made of", "", "由……制成"],
      ["look like", "", "看起来像"],
      ["have no", "", "没有（= don't have any）"]
    ]},

    { u: 2, title: "Me and my friends", words: [
      ["lovely", "adj.", "令人愉快的；极好的"],
      ["great", "adj.", "好极的；使人快乐的"],
      ["often", "adv.", "时常"],
      ["always", "adv.", "总是"],
      ["interesting", "adj.", "有趣的；有吸引力的"],
      ["helpful", "adj.", "愿意帮忙的"],
      ["English", "n.", "英语"],
      ["duck", "v.", "躲闪；躲避"],
      ["different", "adj.", "不同的"],
      ["writer", "n.", "作家"],
      ["excited", "adj.", "感到激动的"],
      ["be good at ...", "", "擅长……"],
      ["skip with a long rope", "", "用长绳跳绳"],
      ["take it easy", "", "放轻松"],
      ["a guessing game", "", "一个猜谜游戏"],
      ["keep going", "", "继续下去"],
      ["tell interesting stories", "", "讲有趣的故事"]
    ]},

    { u: 3, title: "Animals", words: [
      ["panda", "n.", "大熊猫"],
      ["black", "adj.", "黑的；黑色的"],
      ["white", "adj.", "白的；白色的"],
      ["hometown", "n.", "家乡"],
      ["monkey", "n.", "猴子"],
      ["yellow", "adj.", "黄的；黄色的"],
      ["elephant", "n.", "象"],
      ["grey", "adj.", "灰色的"],
      ["trunk", "n.", "象鼻"],
      ["family", "n.", "家庭"],
      ["India", "n.", "印度"],
      ["Africa", "n.", "非洲"],
      ["tail", "n.", "尾巴"],
      ["kind", "adj.", "友好的"],
      ["warm", "adj.", "温暖的"],
      ["bed", "n.", "床"],
      ["melt", "v.", "融化"],
      ["baby elephant", "", "小象"],
      ["mother elephant", "", "母象"],
      ["polar bear", "", "北极熊"],
      ["the North Pole", "", "北极"],
      ["roll like a ball", "", "像球一样滚动"],
      ["light grey", "", "浅灰色"],
      ["shower with your trunk", "", "用你的象鼻洗澡"],
      ["the elephant family", "", "大象家族"],
      ["in other places", "", "在其他的地方"],
      ["live in places with trees and water nearby", "", "住在附近有树和水的地方"],
      ["be very kind to", "", "对……很友好"],
      ["thick fur", "", "厚厚的毛"],
      ["a lot of", "", "许多（= lots of）"],
      ["catch seals and fish for food", "", "捕捞海豹和鱼类作为食物"],
      ["swing on branches", "", "在树枝上摆荡"]
    ]},

    { u: 4, title: "Celebrations", words: [
      ["invitation", "n.", "（口头或书面的）邀请"],
      ["party", "n.", "聚会；联欢会"],
      ["activity", "n.", "活动"],
      ["bring", "v.", "带来"],
      ["letter", "n.", "信；函"],
      ["child", "n.", "儿童（复数 children）"],
      ["tradition", "n.", "传统"],
      ["love", "v.& n.", "爱；热爱"],
      ["bowl", "n.", "碗"],
      ["egg", "n.", "鸡蛋"],
      ["wish", "v.", "祝愿"],
      ["soup", "n.", "汤；羹"],
      ["noodles", "n.", "面条"],
      ["invite", "v.", "邀请"],
      ["health", "n.", "健康"],
      ["surprised", "adj.", "感到惊讶的；吃惊的"],
      ["watch a play", "", "看一场戏剧"],
      ["share a big cake", "", "分享一个大蛋糕"],
      ["a great football player", "", "一名伟大的足球运动员"],
      ["come true", "", "实现"],
      ["a letter with no words", "", "一封无字信"],
      ["a bowl of noodles", "", "一碗面条"],
      ["a long and happy life", "", "一个幸福长寿的人生"]
    ]},

    { u: 5, title: "My neighbourhood", words: [
      ["neighbourhood", "n.", "街区"],
      ["park", "n.", "公园"],
      ["shop", "n.", "商店"],
      ["cinema", "n.", "电影院"],
      ["supermarket", "n.", "超市"],
      ["boat", "n.", "小船"],
      ["bridge", "n.", "桥"],
      ["photo", "n.", "照片"],
      ["amazing", "adj.", "令人大为惊奇的"],
      ["people", "n.", "人"],
      ["restaurant", "n.", "餐馆"],
      ["museum", "n.", "博物馆"],
      ["town", "n.", "小镇；城镇"],
      ["famous", "adj.", "著名的"],
      ["go around", "", "参观（附近某处）"],
      ["visit a water town", "", "参观一个水乡"],
      ["go on a boat trip", "", "乘船出游"],
      ["take a photo", "", "拍照（take photos）"],
      ["out of battery", "", "没电"],
      ["by the water", "", "在水旁"],
      ["a photo of", "", "一张……的照片"]
    ]},

    { u: 6, title: "Autumn", words: [
      ["autumn", "n.", "秋天"],
      ["farm", "n.", "农场"],
      ["boy", "n.", "男孩"],
      ["fruit", "n.", "水果"],
      ["girl", "n.", "女孩"],
      ["golden", "adj.", "金色的"],
      ["apple", "n.", "苹果"],
      ["worker", "n.", "工作者"],
      ["fall", "v./n.", "掉落；秋天"],
      ["leaf", "n.", "叶子（复数 leaves）"],
      ["found", "v.", "找到（find 的过去式）"],
      ["colourful leaves", "", "五颜六色的叶子"],
      ["fly south", "", "往南飞"],
      ["collect food", "", "收集食物"],
      ["pick fruit", "", "摘水果"],
      ["fly across the sky", "", "飞过天空"],
      ["get closer", "", "靠得更近一点"]
    ]},

    { u: 7, title: "Healthy food", words: [
      ["breakfast", "n.", "早餐"],
      ["menu", "n.", "菜单"],
      ["juice", "n.", "果汁"],
      ["milk", "n.", "（牛或羊等的）奶"],
      ["banana", "n.", "香蕉"],
      ["week", "n.", "周；星期"],
      ["eat", "v.", "吃"],
      ["tomorrow", "n.", "明天"],
      ["energy", "n.", "能量"],
      ["protein", "n.", "蛋白质"],
      ["vitamin", "n.", "维生素"],
      ["cry", "v.", "喊叫；呼喊"],
      ["healthy", "adj.", "健康的"],
      ["favourite", "adj.", "最喜欢的"],
      ["easy", "adj.", "简单的"],
      ["vegetable", "n.", "蔬菜"],
      ["soya milk", "", "豆浆"],
      ["make a video call", "", "进行视频通话"],
      ["how often", "", "多久一次"],
      ["every day", "", "每天"],
      ["two or three times a week", "", "一周两到三次"]
    ]},

    { u: 8, title: "Be honest", words: [
      ["honest", "adj.", "诚实的；正直的"],
      ["stop", "v.", "停止；停下"],
      ["doll", "n.", "玩偶；玩具娃娃"],
      ["break", "v.", "打碎；打破"],
      ["arm", "n.", "手臂"],
      ["empty", "adj.", "空的"],
      ["pot", "n.", "罐；壶；锅"],
      ["seed", "n.", "种子"],
      ["month", "n.", "月份"],
      ["happen", "v.", "发生"],
      ["left", "adj.", "左边的"],
      ["winner", "n.", "获胜的人"],
      ["water", "v.", "浇水"],
      ["boiled", "adj.", "煮熟的"],
      ["keep one's word", "", "遵守（某人的）诺言"],
      ["give ... back", "", "归还……"],
      ["on time", "", "准时"],
      ["tell the truth", "", "说真话"],
      ["never tell a lie", "", "从不撒谎"],
      ["tell sb. about sth.", "", "告诉某人某事"],
      ["think about", "", "思考"],
      ["right now", "", "立刻；马上"],
      ["smile at", "", "对……微笑"]
    ]},

    { u: 9, title: "Time", words: [
      ["time", "n.", "时间"],
      ["evening", "n.", "晚上；傍晚"],
      ["night", "n.", "夜；夜晚"],
      ["afternoon", "n.", "下午"],
      ["noon", "n.", "正午；中午"],
      ["midnight", "n.", "半夜；午夜"],
      ["day", "n.", "白天"],
      ["hour hand", "n.", "（钟表的）时针"],
      ["minute hand", "n.", "（钟表的）分针"],
      ["seven o'clock", "", "七点钟"],
      ["half past eleven", "", "十一点半"],
      ["ten to four", "", "三点五十分"],
      ["the earth", "", "地球"],
      ["the moon", "", "月球"],
      ["get up", "", "起床"],
      ["have lunch", "", "吃午饭"],
      ["go home", "", "回家"],
      ["have a family dinner", "", "吃家庭晚餐"],
      ["time difference", "", "时差"],
      ["New Year's Day", "", "元旦"],
      ["point to ...", "", "指向……"]
    ]},

    { u: 10, title: "Weather", words: [
      ["father", "n.", "父亲；爸爸"],
      ["sunny", "adj.", "阳光充足的"],
      ["rainy", "adj.", "多雨的"],
      ["cloudy", "adj.", "阴天的；多云的"],
      ["brother", "n.", "哥哥；弟弟"],
      ["windy", "adj.", "多风的；风大的"],
      ["snowy", "adj.", "下雪多的"],
      ["weather", "n.", "天气"],
      ["degree", "n.", "度（温度单位）"],
      ["lamb", "n.", "小羊"],
      ["tortoise", "n.", "陆龟"],
      ["sign", "n.", "迹象；征兆"],
      ["hurry", "v.", "赶快；急忙（做某事）"],
      ["temperature", "n.", "气温；温度"],
      ["back", "n.", "背部"],
      ["dragonfly", "n.", "蜻蜓"],
      ["web", "n.", "（蜘蛛）网"],
      ["weather report", "", "气象报告"],
      ["heavy rain", "", "大雨"],
      ["in the sun", "", "在太阳底下"],
      ["in the wind", "", "在风中"],
      ["play in the snow", "", "在雪中玩耍"],
      ["fly low", "", "低飞"],
      ["take back", "", "收回"]
    ]}
  ];

  /* 把紧凑的三元组摊成对象，顺手标上「是不是词组」和它属于哪个 unit。
     判断标准就一条：预习单上没给词性的都是词组（含空格的短语）。 */
  function expand() {
    var out = [];
    UNITS.forEach(function (unit) {
      unit.words.forEach(function (row, i) {
        out.push({
          w: row[0],
          p: row[1],
          c: row[2],
          unit: unit.u,
          title: unit.title,
          phrase: !row[1],
          id: "u" + unit.u + "-" + (i + 1)
        });
      });
    });
    return out;
  }

  var ALL = expand();

  var API = {
    UNITS: UNITS,
    all: function () { return ALL.slice(); },
    unit: function (u) { return ALL.filter(function (x) { return x.unit === u; }); },
    words: function () { return ALL.filter(function (x) { return !x.phrase; }); },
    phrases: function () { return ALL.filter(function (x) { return x.phrase; }); },
    count: ALL.length
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.词库4A = API;
})(typeof window !== "undefined" ? window : this);
