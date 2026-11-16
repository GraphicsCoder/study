# -*- coding: utf-8 -*-
"""熏听用的对话 / 短文材料（四年级上学期水平）。

想改听力内容就改这个文件，改完重新跑一次：

    python 生成熏听音频.py

结构说明：
    PIECES = [
      {
        "title": "显示在播放器里的标题",
        "note":  "这段练什么，随手写给自己看的，不会出现在页面上",
        "lines": [
            ("A", "English sentence.", "中文意思"),
            ...
        ],
      },
    ]

第一个字段是说话人：
    "A" → 女声      "B" → 男声      "N" → 旁白（短文用，女声）
对话用 A / B 轮流，听起来才像两个人在说话。

播放器里的「对话 / 短文」标签就是照这个自动判的：
出现过 A 或 B 的算对话，整段都是 N 的算短文，不用另外写字段。

中文只在播放器上显示（可以关掉），不会被读出来。
"""

PIECES = [

{
  "title": "我的猫在哪儿？",
  "note": "地点方位介词：under / behind",
  "lines": [
    ("A", "Mum, where is my cat?",        "妈妈，我的猫在哪儿？"),
    ("B", "Is it under the table?",       "它在桌子下面吗？"),
    ("A", "No, it isn't.",                "不，不在。"),
    ("B", "Look! It's behind the door.",  "看！它在门后面。"),
    ("A", "Oh, yes. It's sleeping.",      "哦，是的。它在睡觉。"),
    ("B", "Don't wake it up.",            "别把它吵醒。"),
  ],
},

{
  "title": "我的房间",
  "note": "短文：there be + on / under / on the wall",
  "lines": [
    ("N", "This is my bedroom.",                "这是我的卧室。"),
    ("N", "There is a bed and a desk in it.",   "里面有一张床和一张书桌。"),
    ("N", "My schoolbag is on the chair.",      "我的书包在椅子上。"),
    ("N", "There are some books on the desk.",  "书桌上有一些书。"),
    ("N", "A picture is on the wall.",          "墙上有一幅画。"),
    ("N", "My football is under the bed.",      "我的足球在床底下。"),
    ("N", "I like my bedroom very much.",       "我非常喜欢我的卧室。"),
  ],
},

{
  "title": "几点了？",
  "note": "时间介词 at + what time / when",
  "lines": [
    ("A", "What time is it now?",             "现在几点？"),
    ("B", "It's half past seven.",            "七点半。"),
    ("A", "When do you go to school?",        "你什么时候上学？"),
    ("B", "I go to school at eight o'clock.", "我八点上学。"),
    ("A", "Do you have lunch at school?",     "你在学校吃午饭吗？"),
    ("B", "Yes. I have lunch at twelve.",     "是的。我十二点吃午饭。"),
  ],
},

{
  "title": "我的生日",
  "note": "短文：时间介词 in / on / at 三个都出现，对比记",
  "lines": [
    ("N", "My birthday is in May.",                     "我的生日在五月。"),
    ("N", "It's on the fifth of May.",                  "是五月五号。"),
    ("N", "I have a party in the afternoon.",           "我下午开派对。"),
    ("N", "My friends come to my home at three o'clock.", "我的朋友们三点来我家。"),
    ("N", "We sing and dance together.",                "我们一起唱歌跳舞。"),
    ("N", "At night, I am very happy.",                 "到了晚上，我非常开心。"),
  ],
},

{
  "title": "你怎么上学？",
  "note": "交通方式：by bike / on foot / in his car（注意 on foot 不用 by）",
  "lines": [
    ("A", "How do you go to school, Ben?",            "本，你怎么去上学？"),
    ("B", "I go to school by bike.",                  "我骑自行车上学。"),
    ("A", "Does your sister go with you?",            "你妹妹跟你一起去吗？"),
    ("B", "No. She goes on foot.",                    "不。她走路去。"),
    ("A", "My father takes me to school in his car.", "我爸爸开车送我上学。"),
    ("B", "That's nice.",                             "那真好。"),
  ],
},

{
  "title": "在公园里",
  "note": "短文：in the tree（鸟在树上）vs under the tree，near / there be",
  "lines": [
    ("N", "It's Sunday morning.",                   "现在是星期天早上。"),
    ("N", "We are in the park.",                    "我们在公园里。"),
    ("N", "There is a big tree near the lake.",     "湖边有一棵大树。"),
    ("N", "Some birds are in the tree.",            "一些鸟停在树上。"),
    ("N", "There are four boys under the tree.",    "树下有四个男孩。"),
    ("N", "They are playing football.",             "他们在踢足球。"),
  ],
},

{
  "title": "这是谁的手套？",
  "note": "whose / what colour",
  "lines": [
    ("A", "Whose gloves are these?",   "这是谁的手套？"),
    ("B", "They are Alice's.",         "是爱丽丝的。"),
    ("A", "What colour are they?",     "它们是什么颜色的？"),
    ("B", "They are red and white.",   "红白相间的。"),
    ("A", "Is this her hat, too?",     "这也是她的帽子吗？"),
    ("B", "No. That one is mine.",     "不。那顶是我的。"),
  ],
},

{
  "title": "在小店里",
  "note": "how many（可数）vs how much（价钱）",
  "lines": [
    ("A", "How many apples do you want?", "你要几个苹果？"),
    ("B", "I want six, please.",          "我要六个，谢谢。"),
    ("A", "Here you are.",                "给你。"),
    ("B", "How much are they?",           "多少钱？"),
    ("A", "Ten yuan.",                    "十元。"),
    ("B", "Thank you very much.",         "非常感谢。"),
  ],
},

{
  "title": "我的朋友本",
  "note": "短文：how old / what … like / next to",
  "lines": [
    ("N", "Ben is my good friend.",              "本是我的好朋友。"),
    ("N", "He is ten years old.",                "他十岁。"),
    ("N", "He is tall and strong.",              "他又高又壮。"),
    ("N", "He likes swimming and running.",      "他喜欢游泳和跑步。"),
    ("N", "He lives next to my home.",           "他住在我家旁边。"),
    ("N", "We go to school together every day.", "我们每天一起上学。"),
  ],
},

{
  "title": "在动物园",
  "note": "综合疑问词：where / how many / what … doing / what … like",
  "lines": [
    ("A", "Where are the pandas?",                     "熊猫在哪里？"),
    ("B", "They are over there, behind the trees.",    "在那边，树后面。"),
    ("A", "How many pandas are there?",                "有几只熊猫？"),
    ("B", "There are three.",                          "有三只。"),
    ("A", "What are they doing?",                      "它们在干什么？"),
    ("B", "They are eating.",                          "它们在吃东西。"),
    ("A", "What are they like?",                       "它们什么样？"),
    ("B", "They are black and white. They are so cute!", "它们是黑白的。太可爱了！"),
  ],
},

]
