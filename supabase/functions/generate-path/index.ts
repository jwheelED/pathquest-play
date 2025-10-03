import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, goal, experienceLevel } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete existing lessons for this user
    await supabase
      .from("lessons")
      .delete()
      .eq("user_id", userId);

    // Generate lessons based on goal and experience level
    const lessons = generateLessons(goal, experienceLevel);

    // Insert lessons with content
    const { error: insertError } = await supabase
      .from("lessons")
      .insert(
        lessons.map((lesson, index) => ({
          user_id: userId,
          title: lesson.title,
          type: lesson.type,
          step_number: index + 1,
          content: JSON.stringify(lesson.content),
        }))
      );

    if (insertError) throw insertError;

    // Initialize user stats if they don't exist
    const { error: statsError } = await supabase
      .from("user_stats")
      .upsert({
        user_id: userId,
        experience_points: 0,
        level: 1,
        coins: 0,
        current_streak: 0,
        longest_streak: 0,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: true
      });

    if (statsError) throw statsError;

    return new Response(
      JSON.stringify({ success: true, lessonsCount: lessons.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating path:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateLessons(goal: string, experienceLevel: string) {
  const goalLower = goal.toLowerCase();
  
  // Determine the topic area
  if (goalLower.includes("javascript") || goalLower.includes("js")) {
    return generateJavaScriptPath(experienceLevel);
  } else if (goalLower.includes("python")) {
    return generatePythonPath(experienceLevel);
  } else if (goalLower.includes("c++") || goalLower.includes("cpp")) {
    return generateCppPath(experienceLevel);
  } else if (goalLower.includes("machine learning") || goalLower.includes("ml") || goalLower.includes("ai")) {
    return generateMLPath(experienceLevel);
  } else if (goalLower.includes("math") || goalLower.includes("algebra") || goalLower.includes("geometry")) {
    return generateMathPath(experienceLevel);
  } else {
    return generateGenericPath(goal, experienceLevel);
  }
}

function generateJavaScriptPath(level: string) {
  if (level === "Beginner") {
    return [
      {
        title: "Introduction to JavaScript",
        type: "Lesson",
        content: {
          text: `# Introduction to JavaScript\n\n## What is JavaScript?\nJavaScript is the programming language of the web. It makes websites interactive and dynamic. Every modern website you use has JavaScript running behind the scenes!\n\n## Why Learn JavaScript?\n- **Most popular programming language**: Used by millions of developers\n- **Versatile**: Build websites, mobile apps, servers, and even games\n- **High demand**: JavaScript developers are in high demand worldwide\n- **Beginner friendly**: Great first programming language\n\n## How JavaScript Works\nJavaScript runs in your web browser and can:\n- Respond to button clicks\n- Update content without reloading the page\n- Create animations and effects\n- Validate forms before submission\n- Store data locally\n\n## Your First JavaScript Code\nHere's a simple example:\n\njavascript\nconsole.log("Hello, World!");\n\n\nThis prints "Hello, World!" to the browser console.\n\n## JavaScript in HTML\nJavaScript is embedded in HTML using <script> tags:\n\nhtml\n<script>\n  alert("Welcome to JavaScript!");\n</script>\n\n\n## Key Concepts You'll Learn\n1. **Variables**: Store and manage data\n2. **Functions**: Reusable blocks of code\n3. **Objects**: Organize related data\n4. **Events**: Respond to user actions\n5. **DOM Manipulation**: Change webpage content\n\n## Tools You Need\n- A web browser (Chrome, Firefox, Safari)\n- A text editor (VS Code, Sublime Text)\n- That's it! No complex setup required\n\n## Getting Started\nJavaScript is forgiving for beginners. You can:\n- Try code immediately in the browser console\n- See results instantly\n- Learn by experimenting\n\n## Real-World Applications\n- **Facebook**: Interactive news feed\n- **Google Maps**: Dynamic map interactions\n- **Netflix**: Smooth video playback\n- **Spotify**: Web player controls\n\n## Your Learning Journey\nMastering JavaScript opens doors to:\n- Front-end development (React, Vue, Angular)\n- Back-end development (Node.js)\n- Mobile apps (React Native)\n- Desktop apps (Electron)\n\n## Remember\nEvery expert programmer started as a beginner. Be patient, practice regularly, and don't be afraid to make mistakes!`
        }
      },
      {
        title: "JavaScript Variables and Data Types",
        type: "Lesson",
        content: {
          text: `# Variables and Data Types\n\n## What are Variables?\nVariables are containers that store data. Think of them as labeled boxes where you keep information.\n\n## Declaring Variables\nJavaScript has three ways to declare variables:\n\n### let (Modern, Recommended)\njavascript\nlet name = "Alice";\nlet age = 25;\nlet isStudent = true;\n\n\n### const (For Constants)\njavascript\nconst PI = 3.14159;\nconst DAYS_IN_WEEK = 7;\n// Cannot be reassigned!\n\n\n### var (Old Style, Avoid)\njavascript\nvar oldStyle = "Not recommended";\n\n\n## Data Types in JavaScript\n\n### 1. String (Text)\njavascript\nlet greeting = "Hello!";\nlet name = 'Bob';\nlet message = Welcome, everyone;\n\n\n### 2. Number\njavascript\nlet age = 30;\nlet price = 19.99;\nlet temperature = -5;\n\n\n### 3. Boolean (True/False)\njavascript\nlet isLoggedIn = true;\nlet hasPermission = false;\n\n\n### 4. Undefined\njavascript\nlet notAssigned;\nconsole.log(notAssigned); // undefined\n\n\n### 5. Null (Intentionally Empty)\njavascript\nlet emptyValue = null;\n\n\n## Naming Rules\n- Start with letter, $, or _\n- Use camelCase: firstName, userAge\n- Be descriptive: studentCount not x\n- Case sensitive: age ≠ Age\n\n## Type Checking\njavascript\ntypeof "hello"  // "string"\ntypeof 42       // "number"\ntypeof true     // "boolean"\n\n\n## String Operations\njavascript\nlet first = "Hello";\nlet last = "World";\nlet full = first + " " + last; // "Hello World"\n\n// Template literals (modern)\nlet message = Hello, \\${name}!;\n\n\n## Number Operations\njavascript\nlet sum = 5 + 3;        // 8\nlet difference = 10 - 4; // 6\nlet product = 6 * 7;     // 42\nlet quotient = 15 / 3;   // 5\nlet remainder = 17 % 5;  // 2\n\n\n## Type Conversion\njavascript\nlet str = "123";\nlet num = Number(str);  // 123\nlet back = String(num); // "123"\n\n\n## Common Mistakes to Avoid\n1. Forgetting to declare variables\n2. Using var instead of let/const\n3. Reassigning const variables\n4. Case sensitivity errors\n\n## Best Practices\n- Use const by default\n- Use let only when reassigning\n- Choose meaningful names\n- One variable per line\n\n## Practice Exercise\njavascript\n// Store your name, age, and favorite color\nlet myName = "Your Name";\nlet myAge = 25;\nlet favoriteColor = "blue";\n\nconsole.log("My name is " + myName);\nconsole.log("I am " + myAge + " years old");\n\n\n## Key Takeaways\n- Variables store data\n- Use let for changeable values\n- Use const for fixed values\n- Strings for text, numbers for math\n- Choose descriptive names`
        }
      },
      {
        title: "Variables Quiz",
        type: "Quiz",
        content: {
          questions: [
            {
              question: "Which keyword should you use for a value that won't change?",
              options: ["let", "const", "var", "static"],
              correct: 1
            },
            {
              question: "What data type is 'Hello World'?",
              options: ["Number", "String", "Boolean", "Object"],
              correct: 1
            },
            {
              question: "Which is a valid variable name?",
              options: ["2ndPlace", "user-name", "firstName", "let"],
              correct: 2
            },
            {
              question: "What does typeof 42 return?",
              options: ["'number'", "'integer'", "'string'", "'digit'"],
              correct: 0
            }
          ]
        }
      },
      {
        title: "JavaScript Functions",
        type: "Lesson",
        content: {
          text: `# Functions in JavaScript\n\n## What are Functions?\nFunctions are reusable blocks of code that perform specific tasks. They're like recipes you can use over and over!\n\n## Why Use Functions?\n- **Reusability**: Write once, use many times\n- **Organization**: Keep code clean and manageable\n- **Abstraction**: Hide complex logic\n- **Maintainability**: Update in one place\n\n## Function Declaration\njavascript\nfunction greet(name) {\n  return Hello, ${name}!;\n}\n\nlet message = greet("Alice"); // "Hello, Alice!"\n\n\n## Function Parts\n1. **function** keyword\n2. **Name**: greet\n3. **Parameters**: (name)\n4. **Body**: { ... }\n5. **Return**: value to output\n\n## Parameters and Arguments\njavascript\nfunction add(a, b) {  // a, b are parameters\n  return a + b;\n}\n\nlet sum = add(5, 3);  // 5, 3 are arguments\nconsole.log(sum);     // 8\n\n\n## Arrow Functions (Modern)\njavascript\nconst greet = (name) => {\n  return Hello, ${name}!;\n};\n\n// Shorthand for simple returns\nconst double = (x) => x * 2;\n\n\n## Default Parameters\njavascript\nfunction greet(name = "Guest") {\n  return Welcome, ${name}!;\n}\n\ngreet();        // "Welcome, Guest!"\ngreet("Bob");   // "Welcome, Bob!"\n\n\n## Multiple Returns\njavascript\nfunction checkAge(age) {\n  if (age >= 18) {\n    return "Adult";\n  } else {\n    return "Minor";\n  }\n}\n\n\n## Function Scope\njavascript\nlet globalVar = "I'm global";\n\nfunction test() {\n  let localVar = "I'm local";\n  console.log(globalVar);  // Works!\n  console.log(localVar);   // Works!\n}\n\ntest();\nconsole.log(localVar); // Error! Not accessible\n\n\n## Callback Functions\njavascript\nfunction processUser(name, callback) {\n  console.log(Processing ${name}...);\n  callback();\n}\n\nprocessUser("Alice", () => {\n  console.log("Done!");\n});\n\n\n## Common Use Cases\n\n### 1. Calculations\njavascript\nfunction calculateTotal(price, tax) {\n  return price + (price * tax);\n}\n\n\n### 2. Validation\njavascript\nfunction isValidEmail(email) {\n  return email.includes("@");\n}\n\n\n### 3. Data Transformation\njavascript\nfunction capitalize(str) {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n\n\n## Best Practices\n1. One function, one purpose\n2. Use descriptive names (verbs)\n3. Keep functions short\n4. Avoid side effects\n5. Always return a value\n\n## Common Mistakes\n- Forgetting return statement\n- Not calling function with ()\n- Wrong number of arguments\n- Scope confusion\n\n## Practice Exercise\njavascript\n// Create a function that calculates area\nfunction calculateArea(width, height) {\n  return width * height;\n}\n\nconsole.log(calculateArea(5, 10)); // 50\n\n// Create a function that checks even/odd\nfunction isEven(num) {\n  return num % 2 === 0;\n}\n\nconsole.log(isEven(4));  // true\nconsole.log(isEven(7));  // false\n\n\n## Key Takeaways\n- Functions make code reusable\n- Use parameters for input\n- Use return for output\n- Arrow functions are concise\n- Keep functions focused and simple`
        }
      },
      {
        title: "Functions Practice",
        type: "Lesson",
        content: {
          instructions: "Practice creating and using JavaScript functions. Write clean, working code for each task.",
          tasks: [
            "Create a function called 'multiply' that takes two numbers and returns their product",
            "Write a function 'isPositive' that returns true if a number is greater than 0",
            "Create a function 'getFullName' that takes firstName and lastName and returns them combined",
            "Write a function 'celsiusToFahrenheit' that converts temperature (formula: F = C * 9/5 + 32)",
            "Create a function 'findMax' that takes two numbers and returns the larger one"
          ]
        }
      },
      {
        title: "Build a Simple Calculator Project",
        type: "Lesson",
        content: {
          instructions: "Create a simple calculator using JavaScript functions to demonstrate your understanding.",
          requirements: [
            "Create four functions: add, subtract, multiply, and divide",
            "Each function should take two numbers as parameters and return the result",
            "Test each function with different numbers and log the results",
            "Add error handling for division by zero",
            "Create a main function that calls all calculator functions and displays results in a organized format"
          ]
        }
      }
    ];
  }
  return generateGenericPath("JavaScript", level);
}

function generatePythonPath(level: string) {
  return generateGenericPath("Python", level);
}

function generateCppPath(level: string) {
  return generateGenericPath("C++", level);
}

function generateMLPath(level: string) {
  return generateGenericPath("Machine Learning", level);
}

function generateMathPath(level: string) {
  if (level === "Beginner") {
    return [
      { title: "Introduction to Fractions", type: "Lesson", content: {} },
      { title: "Fractions Quiz", type: "Quiz", content: {} },
      { title: "Fraction Practice Problems", type: "Lesson", content: {} },
      { title: "Basic Algebra Concepts", type: "Lesson", content: {} },
      { title: "Algebra Practice", type: "Lesson", content: {} },
    ];
  }
  return generateGenericPath("Mathematics", level);
}

function generateGenericPath(goal: string, level: string) {
  return [
    { title: `Introduction to ${goal}`, type: "Lesson", content: {} },
    { title: `${goal} Fundamentals`, type: "Lesson", content: {} },
    { title: `${goal} Quiz`, type: "Quiz", content: {} },
    { title: `${goal} Practice Exercises`, type: "Lesson", content: {} },
    { title: `${goal} Final Project`, type: "Lesson", content: {} },
  ];
}
