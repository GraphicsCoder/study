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


# ============ 4A 预习单配套：一个 unit 一段 ============
# 用的都是那一单元预习单上的词，听的时候就是在复习这一关的生词。
# group 字段会盖掉默认的「听力材料 · 标题」，让它在播放器里自成一组。

{
  "group": "4A Unit 1 · 我们的学校",
  "title": "参观我们的学校",
  "note": "Unit 1：school building / ground floor / art room / sports field / library",
  "lines": [
    ("A", "Welcome to our school!",                        "欢迎来我们学校！"),
    ("B", "Wow, the school building is so tall.",          "哇，教学楼好高。"),
    ("A", "Our classroom is on the ground floor.",         "我们教室在一楼。"),
    ("B", "What's that room?",                             "那个房间是什么？"),
    ("A", "It's the art room. The reading room is next to it.", "是美术教室。阅览室就在它旁边。"),
    ("B", "Where do you do sports?",                       "你们在哪里做运动？"),
    ("A", "On the sports field behind the library.",       "在图书馆后面的运动场。"),
    ("B", "Your school looks like a park!",                "你们学校看起来像个公园！"),
  ],
},

{
  "group": "4A Unit 2 · 我和我的朋友",
  "title": "猜猜她是谁",
  "note": "Unit 2：a guessing game / helpful / interesting / be good at / keep going",
  "lines": [
    ("A", "Let's play a guessing game.",                   "我们玩个猜谜游戏吧。"),
    ("B", "Great! Who is she?",                            "好极了！她是谁？"),
    ("A", "She is always helpful.",                        "她总是乐于助人。"),
    ("A", "She often tells interesting stories.",          "她时常讲有趣的故事。"),
    ("B", "Is she good at English?",                       "她擅长英语吗？"),
    ("A", "Yes. She wants to be a writer.",                "是的。她想当作家。"),
    ("B", "Can she skip with a long rope?",                "她会用长绳跳绳吗？"),
    ("A", "Yes, she can. Keep going!",                     "会的。继续猜！"),
    ("B", "I know! She is Lily. She is lovely.",           "我知道了！是莉莉。她很可爱。"),
  ],
},

{
  "group": "4A Unit 3 · 动物",
  "title": "大象、猴子和北极熊",
  "note": "Unit 3：trunk / swing on branches / polar bear / thick fur / be kind to",
  "lines": [
    ("N", "Elephants live in India and Africa.",           "大象生活在印度和非洲。"),
    ("N", "They are grey and very big.",                   "它们是灰色的，非常大。"),
    ("N", "An elephant has a long trunk.",                 "大象有长长的象鼻。"),
    ("N", "It showers with its trunk.",                    "它用象鼻洗澡。"),
    ("N", "Monkeys swing on branches.",                    "猴子在树枝上摆荡。"),
    ("N", "Pandas are black and white. They eat bamboo.",  "熊猫是黑白的。它们吃竹子。"),
    ("N", "Polar bears live at the North Pole.",           "北极熊住在北极。"),
    ("N", "They have thick fur, so they are warm.",        "它们有厚厚的毛，所以很暖和。"),
    ("N", "Be very kind to animals.",                      "要对动物很友好。"),
  ],
},

{
  "group": "4A Unit 4 · 节日和生日",
  "title": "一封生日邀请",
  "note": "Unit 4：invitation / party / tradition / a bowl of noodles / come true",
  "lines": [
    ("A", "This is an invitation for you.",                "这是给你的一封邀请。"),
    ("B", "A birthday party? When is it?",                 "生日聚会？什么时候？"),
    ("A", "On Sunday. We will share a big cake.",          "周日。我们要分享一个大蛋糕。"),
    ("B", "What can I bring?",                             "我可以带什么？"),
    ("A", "Just come. In China we eat a bowl of noodles.", "来就行。在中国我们吃一碗面条。"),
    ("A", "It's a tradition for a long and happy life.",   "这是祝愿幸福长寿的传统。"),
    ("B", "I wish you good health!",                       "祝你身体健康！"),
    ("B", "May all your wishes come true.",                "愿你所有的愿望都实现。"),
  ],
},

{
  "group": "4A Unit 5 · 我的街区",
  "title": "去水乡玩一天",
  "note": "Unit 5：neighbourhood / museum / water town / boat trip / out of battery",
  "lines": [
    ("A", "Let's go around our neighbourhood.",            "我们在街区里转转吧。"),
    ("B", "Is there a museum here?",                       "这里有博物馆吗？"),
    ("A", "Yes, and a cinema next to the supermarket.",    "有，超市旁边还有电影院。"),
    ("B", "Amazing! What about Sunday?",                   "太惊奇了！那周日呢？"),
    ("A", "We will visit a famous water town.",            "我们要去参观一个著名的水乡。"),
    ("B", "Can we go on a boat trip?",                     "我们能乘船出游吗？"),
    ("A", "Of course. The houses are by the water.",       "当然。房子都在水旁。"),
    ("B", "I will take a lot of photos.",                  "我要拍很多照片。"),
    ("A", "Don't let your phone run out of battery!",      "别让你的手机没电了！"),
  ],
},

{
  "group": "4A Unit 6 · 秋天",
  "title": "金色的秋天",
  "note": "Unit 6：golden / colourful leaves / pick fruit / fly south / collect food",
  "lines": [
    ("N", "Autumn is here.",                               "秋天来了。"),
    ("N", "The leaves are golden and colourful.",          "树叶金黄，五颜六色。"),
    ("N", "They fall from the trees.",                     "它们从树上掉落。"),
    ("N", "On the farm, workers pick fruit.",              "在农场，工人们摘水果。"),
    ("N", "The apples are big and sweet.",                 "苹果又大又甜。"),
    ("N", "Birds fly south across the sky.",               "鸟儿飞过天空往南飞。"),
    ("N", "Little animals collect food for winter.",       "小动物为冬天收集食物。"),
    ("N", "Autumn is a busy and happy time.",              "秋天是忙碌又快乐的时候。"),
  ],
},

{
  "group": "4A Unit 7 · 健康饮食",
  "title": "早餐吃什么",
  "note": "Unit 7：breakfast / protein / vitamin / healthy / how often",
  "lines": [
    ("A", "What's for breakfast?",                         "早餐吃什么？"),
    ("B", "Soya milk, eggs and a banana.",                 "豆浆、鸡蛋和一根香蕉。"),
    ("A", "Eggs give us protein.",                         "鸡蛋给我们蛋白质。"),
    ("B", "And fruit gives us vitamins.",                  "水果给我们维生素。"),
    ("A", "How often do you eat vegetables?",              "你多久吃一次蔬菜？"),
    ("B", "Every day. They are healthy.",                  "每天。它们很健康。"),
    ("A", "My favourite drink is apple juice.",            "我最喜欢的饮料是苹果汁。"),
    ("B", "Let's eat well and have lots of energy!",       "我们好好吃饭，充满能量！"),
  ],
},

{
  "group": "4A Unit 8 · 做个诚实的孩子",
  "title": "煮熟的种子",
  "note": "Unit 8：seed / pot / empty / tell the truth / winner",
  "lines": [
    ("N", "The king gave every child a seed.",             "国王给每个孩子一颗种子。"),
    ("N", "He said, water it for three months.",           "他说，浇三个月的水。"),
    ("N", "Ping watered his seed every day.",              "平每天给种子浇水。"),
    ("N", "But nothing happened. His pot was empty.",      "可是什么也没发生。他的花盆空空的。"),
    ("N", "Ping told the truth to the king.",              "平对国王说了真话。"),
    ("N", "All the seeds were boiled.",                    "所有的种子都是煮熟的。"),
    ("N", "So Ping was the winner.",                       "所以平是获胜的人。"),
    ("N", "Be honest and never tell a lie.",               "做个诚实的人，从不撒谎。"),
  ],
},

{
  "group": "4A Unit 9 · 时间",
  "title": "我的一天",
  "note": "Unit 9：o'clock / half past / hour hand / minute hand / get up",
  "lines": [
    ("A", "What time is it?",                              "现在几点？"),
    ("B", "It's seven o'clock. Time to get up.",           "七点钟。该起床了。"),
    ("A", "I have lunch at noon.",                         "我中午吃午饭。"),
    ("B", "I go home at half past four.",                  "我四点半回家。"),
    ("A", "In the evening I read books.",                  "晚上我看书。"),
    ("B", "I go to bed before midnight.",                  "我在半夜之前睡觉。"),
    ("A", "Look, the hour hand points to seven.",          "看，时针指向七。"),
    ("B", "And the minute hand points to twelve.",         "分针指向十二。"),
  ],
},

{
  "group": "4A Unit 10 · 天气",
  "title": "明天下雨吗",
  "note": "Unit 10：weather report / heavy rain / fly low / play in the snow",
  "lines": [
    ("A", "What's the weather like today?",                "今天天气怎么样？"),
    ("B", "It's sunny and warm.",                          "阳光充足，很暖和。"),
    ("A", "The weather report says heavy rain is coming.", "气象报告说有大雨要来。"),
    ("B", "Really? How do you know?",                      "真的吗？你怎么知道？"),
    ("A", "Look, the dragonflies fly low. It's a sign.",   "看，蜻蜓低飞。这是征兆。"),
    ("B", "The tortoise is out, too. Let's hurry home!",   "陆龟也出来了。我们赶快回家！"),
    ("A", "Tomorrow it will be cloudy and snowy.",         "明天会阴天还下雪。"),
    ("B", "Then we can play in the snow!",                 "那我们就能在雪中玩耍了！"),
  ],
},

]
